import os
import shutil
import subprocess
import json
from pathlib import Path
import boto3
import numpy as np
import traceback

try:
    import essentia.standard as es
    from essentia import Pool
except ImportError:
    es = None
    print("="*80)
    print("WARNING: The 'essentia' library could not be imported.")
    print("Audio analysis (BPM, Key, Structure) will be skipped. Please ensure it is installed.")
    print("="*80)


INPUT_DIR = Path(__file__).parent / "temp_uploads"
OUTPUT_DIR = Path(__file__).parent / "separated_audio"
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

class DemucsSeparator:
    def __init__(self, s3_client, model: str = "htdemucs_s"):
        self.model = model
        self.s3_client = s3_client
        self.aws_region = "eu-west-2"

    def _convert_numpy_types(self, obj):
        """Recursively converts numpy types in a dictionary to native Python types."""
        if isinstance(obj, dict):
            return {k: self._convert_numpy_types(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_numpy_types(i) for i in obj]
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj
    
    def analyze_audio_with_essentia(self, file_path: str) -> dict:
        if not es:
            return {"error": "Essentia library not available."}
        try:
            loader = es.MonoLoader(filename=str(file_path), sampleRate=44100)
            audio = loader()
            sample_rate = 44100

            if audio is None or len(audio) == 0:
                print(f"Warning: Essentia's MonoLoader failed or returned empty audio for {file_path}.")
                return {"error": "Audio file could not be loaded. It may be corrupt or in an unsupported format."}

            max_duration_seconds = 300
            max_samples = int(max_duration_seconds * sample_rate)
            if len(audio) > max_samples:
                audio = audio[:max_samples]

            if len(audio) < sample_rate * 2:
                return {"error": "Audio file is too short for analysis."}
            
            rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
            bpm, _, _, _, _ = rhythm_extractor(audio)
            
            key_extractor = es.KeyExtractor()
            key, scale, strength = key_extractor(audio)

            analysis_data = {
                "bpm": bpm,
                "key": f"{key} {scale}",
                "key_strength": strength,
            }
            
            converted_data = self._convert_numpy_types(analysis_data)
            
            bpm_val = converted_data.get('bpm')
            if isinstance(bpm_val, list) and bpm_val:
                bpm_val = bpm_val[0]

            strength_val = converted_data.get('key_strength')
            if isinstance(strength_val, list) and strength_val:
                strength_val = strength_val[0]

            converted_data['bpm'] = round(float(bpm_val), 2) if bpm_val is not None else 0.0
            converted_data['key_strength'] = round(float(strength_val), 2) if strength_val is not None else 0.0

            print(f"Essentia analysis complete for {file_path}")
            return converted_data
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
            for stem_name in ["guitar", "no_guitar"]:
                local_file_path = local_stems_dir / f"{stem_name}.{output_extension}"
                if local_file_path.exists():
                    stem_key = f"stems/{username}/{task_id}/{stem_name}.{output_extension}"
                    self.s3_client.upload_file(str(local_file_path), bucket_name, stem_key, ExtraArgs={'ACL': 'public-read', 'ContentType': content_type})
                    stem_urls[stem_name] = f"{base_url}/{stem_key}"

            if "no_guitar" in stem_urls:
                stem_urls["backingTrack"] = stem_urls.pop("no_guitar")

            manifest_content = {"stems": stem_urls, "originalFileName": original_filename}
            manifest_key = f"stems/{username}/{task_id}/manifest.json"
            self.s3_client.put_object(Bucket=bucket_name, Key=manifest_key, 
            Body=json.dumps(manifest_content), ContentType='application/json', ACL='public-read')
            
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