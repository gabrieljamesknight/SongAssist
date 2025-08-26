import os
import shutil
import subprocess
import json
from pathlib import Path
import boto3

try:
    import essentia.standard as es
    from essentia import Pool
except ImportError:
    es = None
    print("="*80)
    print("WARNING: The 'essentia' library could not be imported.")
    print("Audio analysis (BPM, Key) will be skipped. Please ensure it is installed.")
    print("="*80)


INPUT_DIR = Path(__file__).parent / "temp_uploads"
OUTPUT_DIR = Path(__file__).parent / "separated_audio"
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

class DemucsSeparator:
    def __init__(self, model: str = "htdemucs_6s"):
        self.model = model
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
        )
        self.aws_region = "eu-west-2"

    def analyze_audio_with_essentia(self, file_path: str) -> dict:
        if not es:
            return {"error": "Essentia library not available."}
        try:
            loader = es.MonoLoader(filename=str(file_path), sampleRate=44100)
            audio = loader()
            sample_rate = 44100
            if len(audio) < sample_rate * 2:
                return {"error": "Audio file is too short for analysis."}
            
            rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
            bpm, beats, _, _, _ = rhythm_extractor(audio)
            
            key_extractor = es.KeyExtractor()
            key, scale, strength = key_extractor(audio)

            progression = []
            segments = []
            
            try:
                frame_size = 4096
                hop_size = 2048
                
                window = es.Windowing(type='hann')
                spectrum = es.Spectrum()
                spectral_peaks = es.SpectralPeaks(orderBy='magnitude', magnitudeThreshold=0.00001, minFrequency=20, maxFrequency=3500, maxPeaks=60)
                hpcp_extractor = es.HPCP(size=12, referenceFrequency=440, bandPreset=False, minFrequency=20, maxFrequency=3500)
                chords_estimator = es.ChordsDetection()
                
                chords_list = []
                hpcp_pool = Pool()
                
                for frame in es.FrameGenerator(audio, frameSize=frame_size, hopSize=hop_size, startFromZero=True):
                    win_frame = window(frame)
                    spec = spectrum(win_frame)
                    freqs, mags = spectral_peaks(spec)
                    hpcp = hpcp_extractor(freqs, mags)
                    hpcp_pool.add('tonal.hpcp', hpcp)
                    chord, _ = chords_estimator(hpcp)
                    chords_list.append(chord)
                    
                if chords_list:
                    current_chord = "N"
                    for i, chord in enumerate(chords_list):
                        if chord != current_chord:
                            current_chord = chord
                            current_time = i * hop_size / sample_rate
                            if not progression or progression[-1]["chord"] != current_chord:
                                progression.append({"time": round(current_time, 2), "chord": current_chord})

                if hpcp_pool['tonal.hpcp'].shape[0] > 10:
                    segmenter = es.SBic(cp=15, minLength=3)
                    segment_boundaries_frames = segmenter(hpcp_pool['tonal.hpcp'])
                    if len(segment_boundaries_frames) > 0:
                        start_time = 0.0
                        for i, boundary_frame in enumerate(segment_boundaries_frames):
                            end_time = boundary_frame * hop_size / sample_rate
                            segments.append({"start": round(start_time, 2), "end": round(end_time, 2), "label": f"Segment {i+1}"})
                            start_time = end_time
                        final_time = len(audio) / sample_rate
                        segments.append({"start": round(start_time, 2), "end": round(final_time, 2), "label": f"Segment {len(segments)+1}"})

            except Exception as frame_e:
                print(f"Warning: Could not perform detailed chord/segment analysis: {frame_e}")
                progression.append({"time": 0, "chord": "Analysis Failed"})
            
            analysis_data = {
                "bpm": round(bpm, 2),
                "beats": [round(b, 2) for b in beats.tolist()],
                "key": key,
                "scale": scale,
                "key_strength": round(strength, 2),
                "chord_progression": progression,
                "segments": segments,
            }
            print(f"Essentia analysis complete for {file_path}")
            return analysis_data
        except Exception as e:
            print(f"Could not analyze audio with Essentia: {e}")
            return {"error": str(e)}

    def get_audio_duration(self, file_path: str) -> float: # Added indentation
        """Gets the duration of an audio file in seconds using ffprobe."""
        try:
            command = [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", file_path
            ]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            return float(result.stdout.strip())
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError) as e:
            print(f"Warning: Could not determine audio duration using ffprobe ({e}).")
            print("Defaulting to safe segmentation for this file.")
            return 999.0

    def separate_audio_stems(self, bucket_name: str, object_key: str, task_id: str, username: str, original_filename: str): # Added indentation
        
        local_input_path = INPUT_DIR / Path(object_key).name
        
        print(f"--- Background task for user '{username}' [ID: {task_id}] started ---")

        try:
            # Download the file from S3 to a local temp path
            print(f"Downloading {object_key} from S3 to {local_input_path}...")
            self.s3_client.download_file(bucket_name, object_key, str(local_input_path))
            print("Download complete.")

            duration = self.get_audio_duration(str(local_input_path))
            
            SEGMENTATION_THRESHOLD = 420 

            command = [
                "python", "-m", "demucs.separate",
                "-n", self.model,
                "--two-stems", "guitar",
            ]

            if duration > SEGMENTATION_THRESHOLD:
                print(f"Song duration ({duration:.0f}s) exceeds threshold. Using segmentation and MP3 output.")
                command.extend([
                    "--segment", "7",
                    "--mp3"
                ])
            else:
                print(f"Song duration ({duration:.0f}s) is within threshold. Using standard WAV processing.")
            
            command.extend([
                "--out", str(OUTPUT_DIR),
                "--filename", "{track}/{stem}.{ext}",
                str(local_input_path)
            ])

            print(f"Running command: {' '.join(command)}")
            subprocess.run(command, capture_output=True, text=True, check=True)
            print("--- Demucs Process Finished Successfully ---")

            track_name = local_input_path.stem
            local_stems_dir = OUTPUT_DIR / self.model / track_name
            base_url = f"https://{bucket_name}.s3.{self.aws_region}.amazonaws.com"
            stem_urls = {}
            output_extension = "mp3" if duration > SEGMENTATION_THRESHOLD else "wav"
            content_type = f"audio/{output_extension}"

            print(f"Uploading stems from {local_stems_dir} to S3 for user '{username}'...")
            # Upload guitar and no_guitar stems
            guitar_stem_path = None

            for stem_name in ["guitar", "no_guitar"]:
                local_file_path = local_stems_dir / f"{stem_name}.{output_extension}"
                if local_file_path.exists():
                    if stem_name == "guitar":
                        guitar_stem_path = local_file_path
                    stem_key = f"stems/{username}/{task_id}/{stem_name}.{output_extension}"
                    # Add ACL and ContentType to make the file public
                    self.s3_client.upload_file(
                        str(local_file_path),
                        bucket_name,
                        stem_key,
                        ExtraArgs={'ACL': 'public-read', 'ContentType': content_type}
                    )
                    stem_urls[stem_name] = f"{base_url}/{stem_key}"
            
            if "no_guitar" in stem_urls:
                stem_urls["backingTrack"] = stem_urls.pop("no_guitar")

            # Create and upload the manifest.json 
            if guitar_stem_path:
                essentia_data = self.analyze_audio_with_essentia(str(guitar_stem_path))
                if "error" not in essentia_data:
                    essentia_key = f"stems/{username}/{task_id}/essentia.json"
                    self.s3_client.put_object(
                        Bucket=bucket_name,
                        Key=essentia_key,
                        Body=json.dumps(essentia_data),
                        ContentType='application/json',
                        ACL='public-read' 
                    )
                    print(f"Uploaded Essentia analysis to S3: {essentia_key}")
                else:
                    print(f"Skipping Essentia JSON upload due to analysis error for task {task_id}.")

            manifest_content = {
                "stems": stem_urls,
                "originalFileName": original_filename
            }
            manifest_key = f"stems/{username}/{task_id}/manifest.json"
            
            self.s3_client.put_object(
                Bucket=bucket_name,
                Key=manifest_key,
                Body=json.dumps(manifest_content),
                ContentType='application/json',
                ACL='public-read' 
            )
            print(f"Created and uploaded manifest file to S3: {manifest_key}")

        except subprocess.CalledProcessError as e:
            print(f"--- DEMUCS FAILED ---")
            print(f"Stderr: {e.stderr}")
            print(f"Stdout: {e.stdout}")
        except Exception as e:
            print(f"--- AN UNEXPECTED ERROR OCCURRED for task {task_id} ---")
            print(f"Error: {str(e)}")
        finally:
            print("Cleaning up local temporary files...")
            if os.path.exists(local_input_path):
                os.remove(local_input_path)
                print(f"Removed temporary input file: {local_input_path}")
            
            local_output_dir_to_clean = OUTPUT_DIR / self.model / local_input_path.stem
            if os.path.exists(local_output_dir_to_clean):
                shutil.rmtree(local_output_dir_to_clean)
                print(f"Removed temporary output directory: {local_output_dir_to_clean}")