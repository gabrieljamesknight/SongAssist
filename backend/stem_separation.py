import os
import shutil
import subprocess
import json
from pathlib import Path

INPUT_DIR = Path(__file__).parent / "temp_uploads"
OUTPUT_DIR = Path(__file__).parent / "separated_audio"
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

class DemucsSeparator:
    def __init__(self, model: str = "htdemucs_6s"):
        self.model = model
        self.INPUT_DIR = INPUT_DIR

    def separate_audio_stems(self, temp_file_path: Path):
        print(f"--- Background task started for {temp_file_path.name} ---")

        try:
            command = [
                "python", "-m", "demucs.separate",
                "-n", self.model,
                "--two-stems", "guitar",
                "--out", str(OUTPUT_DIR),
                # This filename pattern tells demucs to create a subfolder for the track.
                "--filename", "{track}/{stem}.{ext}",
                str(temp_file_path)
            ]
            
            print(f"Running command: {' '.join(command)}")
            subprocess.run(command, capture_output=True, text=True, check=True)
            print("--- Demucs Process Finished Successfully ---")

            # Demucs creates an extra subdirectory named after the model.
            track_name = temp_file_path.stem
            # This is the actual directory where the stems and manifest will live.
            final_output_dir = OUTPUT_DIR / self.model / track_name

            # The URLs in the manifest must also include the model name in their path.
            base_url = "http://127.0.0.1:8000/static"
            stem_urls = {
                "guitar": f"{base_url}/{self.model}/{track_name}/guitar.wav",
                "backingTrack": f"{base_url}/{self.model}/{track_name}/no_guitar.wav"
            }
            
            # Place the manifest file inside the correct, nested directory.
            manifest_path = final_output_dir / "manifest.json"
            with open(manifest_path, 'w') as f:
                json.dump({"stems": stem_urls}, f)
            
            print(f"Created manifest file at: {manifest_path}")

        except subprocess.CalledProcessError as e:
            print(f"--- DEMUCS FAILED ---")
            print(f"Stderr: {e.stderr}")
            print(f"Stdout: {e.stdout}")
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                print(f"Cleaned up temporary file: {temp_file_path}")