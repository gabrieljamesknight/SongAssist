import os
import shutil
import subprocess
import json
from pathlib import Path
import boto3
import numpy as np

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

    def _identify_chords_from_hpcp(self, hpcp_vectors: list, interval_seconds: float) -> list:
        if not hpcp_vectors:
            return []

        PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        major_template = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0])
        minor_template = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0])

        templates = {}
        for i, root in enumerate(PITCH_CLASSES):
            templates[f"{root}"] = np.roll(major_template, i)
            templates[f"{root}m"] = np.roll(minor_template, i)
        
        chords = []
        template_names = list(templates.keys())
        template_matrix = np.array(list(templates.values())).T

        for hpcp_vector in hpcp_vectors:
            try:
                norm = np.linalg.norm(hpcp_vector)
                if norm < 1e-6:
                    chords.append("N/C")
                    continue
                
                normalized_vector = hpcp_vector / norm
            except (ValueError, TypeError):
                chords.append("N/C")
                continue

            similarities = np.dot(normalized_vector, template_matrix)
            best_match_index = np.argmax(similarities)
            chords.append(template_names[best_match_index])

        if not chords: 
            return []

        compressed_progression = []
        current_run = {"start": 0.0, "chord": chords[0]}

        for i in range(1, len(chords)):
            if chords[i] != current_run["chord"]:
                current_run["end"] = round(i * interval_seconds, 2)
                compressed_progression.append(current_run)
                current_run = {"start": round(i * interval_seconds, 2), "chord": chords[i]}

        current_run["end"] = round(len(chords) * interval_seconds, 2)
        compressed_progression.append(current_run)
        
        return compressed_progression

    def analyze_audio_with_essentia(self, file_path: str) -> dict:
        if not es:
            return {"error": "Essentia library not available."}
        try:
            loader = es.MonoLoader(filename=str(file_path), sampleRate=44100)
            audio = loader()
            sample_rate = 44100

            max_duration_seconds = 180
            max_samples = int(max_duration_seconds * sample_rate)
            if len(audio) > max_samples:
                audio = audio[:max_samples]

            if len(audio) < sample_rate * 2:
                return {"error": "Audio file is too short for analysis."}
            
            rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
            bpm, beats, _, _, _ = rhythm_extractor(audio)
            
            key_extractor = es.KeyExtractor()
            key, scale, strength = key_extractor(audio)

            hpcp_vectors = []
            interval_seconds = 2.0
            
            try:
                frame_size = 4096
                hop_size = 2048
                
                window = es.Windowing(type='hann')
                spectrum = es.Spectrum()
                spectral_peaks = es.SpectralPeaks(orderBy='magnitude', magnitudeThreshold=0.00001, minFrequency=80, maxFrequency=3500, maxPeaks=60)
                hpcp_extractor = es.HPCP(size=12, referenceFrequency=440)

                seconds_per_frame = hop_size / sample_rate
                frames_per_window = int(interval_seconds / seconds_per_frame)

                all_hpcps = []
                for frame in es.FrameGenerator(audio, frameSize=frame_size, hopSize=hop_size, startFromZero=True):
                    try:
                        win_frame = window(frame)
                        spec = spectrum(win_frame)
                        freqs, mags = spectral_peaks(spec)
                        if not np.any(mags): continue
                        hpcp = hpcp_extractor(freqs, mags)
                        all_hpcps.append(hpcp)
                    except Exception:
                        continue

                if all_hpcps:
                    for i in range(0, len(all_hpcps), frames_per_window):
                        chunk = all_hpcps[i:i+frames_per_window]
                        if not chunk: continue
                        
                        avg_hpcp = np.mean(np.array(chunk, dtype=np.float32), axis=0)
                        hpcp_vectors.append(avg_hpcp)

            except Exception as e:
                print(f"Warning: Could not perform harmonic analysis: {e}")
            
            chord_progression = self._identify_chords_from_hpcp(hpcp_vectors, interval_seconds)
            
            if not chord_progression and len(audio) > 0:
                duration = len(audio) / sample_rate
                chord_progression = [{"start": 0.0, "end": round(duration, 2), "chord": "N/C"}]
            
            analysis_data = {
                "bpm": round(bpm, 2),
                "key": f"{key} {scale}",
                "key_strength": round(strength, 2),
                "chord_progression": chord_progression
            }
            print(f"Essentia analysis complete for {file_path}")
            return analysis_data
        except Exception as e:
            print(f"Could not analyze audio with Essentia: {e}")
            return {"error": str(e)}

    def get_audio_duration(self, file_path: str) -> float:
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

    def separate_audio_stems(self, bucket_name: str, object_key: str, task_id: str, username: str, original_filename: str):
        local_input_path = INPUT_DIR / Path(object_key).name
        print(f"--- Background task for user '{username}' [ID: {task_id}] started ---")

        try:
            print(f"Downloading {object_key} from S3 to {local_input_path}...")
            self.s3_client.download_file(bucket_name, object_key, str(local_input_path))
            print("Download complete.")
            duration = self.get_audio_duration(str(local_input_path))
            SEGMENTATION_THRESHOLD = 420 
            command = ["python", "-m", "demucs.separate", "-n", self.model, "--two-stems", "guitar"]
            if duration > SEGMENTATION_THRESHOLD:
                print(f"Song duration ({duration:.0f}s) exceeds threshold. Using segmentation and MP3 output.")
                command.extend(["--segment", "7", "--mp3"])
            else:
                print(f"Song duration ({duration:.0f}s) is within threshold. Using standard WAV processing.")
            command.extend(["--out", str(OUTPUT_DIR), "--filename", "{track}/{stem}.{ext}", str(local_input_path)])
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
                    self.s3_client.upload_file(str(local_file_path), bucket_name, stem_key, ExtraArgs={'ACL': 'public-read', 'ContentType': content_type})
                    stem_urls[stem_name] = f"{base_url}/{stem_key}"
            if "no_guitar" in stem_urls:
                stem_urls["backingTrack"] = stem_urls.pop("no_guitar")
            if guitar_stem_path:
                essentia_data = self.analyze_audio_with_essentia(str(guitar_stem_path))
                if "error" not in essentia_data:
                    essentia_key = f"stems/{username}/{task_id}/essentia.json"
                    self.s3_client.put_object(Bucket=bucket_name, Key=essentia_key, Body=json.dumps(essentia_data), ContentType='application/json', ACL='public-read')
                    print(f"Uploaded Essentia analysis to S3: {essentia_key}")
                else:
                    print(f"Skipping Essentia JSON upload due to analysis error for task {task_id}.")
            manifest_content = {"stems": stem_urls, "originalFileName": original_filename}
            manifest_key = f"stems/{username}/{task_id}/manifest.json"
            self.s3_client.put_object(Bucket=bucket_name, Key=manifest_key, Body=json.dumps(manifest_content), ContentType='application/json', ACL='public-read')
            print(f"Created and uploaded manifest file to S3: {manifest_key}")
        except subprocess.CalledProcessError as e:
            print(f"--- DEMUCS FAILED ---\nStderr: {e.stderr}\nStdout: {e.stdout}")
        except Exception as e:
            print(f"--- AN UNEXPECTED ERROR OCCURRED for task {task_id} ---\nError: {str(e)}")
        finally:
            print("Cleaning up local temporary files...")
            if os.path.exists(local_input_path):
                os.remove(local_input_path)
                print(f"Removed temporary input file: {local_input_path}")
            local_output_dir_to_clean = OUTPUT_DIR / self.model / local_input_path.stem
            if os.path.exists(local_output_dir_to_clean):
                shutil.rmtree(local_output_dir_to_clean)
                print(f"Removed temporary output directory: {local_output_dir_to_clean}")