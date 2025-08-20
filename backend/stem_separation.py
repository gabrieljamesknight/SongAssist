import os
import shutil
import subprocess
import json
from pathlib import Path
import boto3

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

    def separate_audio_stems(self, bucket_name: str, object_key: str, task_id: str, username: str, original_filename: str):
        
        local_input_path = INPUT_DIR / Path(object_key).name
        
        print(f"--- Background task for user '{username}' [ID: {task_id}] started ---")

        try:
            # Download the file from S3 to a local temp path
            print(f"Downloading {object_key} from S3 to {local_input_path}...")
            self.s3_client.download_file(bucket_name, object_key, str(local_input_path))
            print("Download complete.")

            command = [
                "python", "-m", "demucs.separate",
                "-n", self.model,
                "--two-stems", "guitar",
                "--out", str(OUTPUT_DIR),
                "--filename", "{track}/{stem}.{ext}",
                str(local_input_path)
            ]
            print(f"Running command: {' '.join(command)}")
            subprocess.run(command, capture_output=True, text=True, check=True)
            print("--- Demucs Process Finished Successfully ---")

            track_name = local_input_path.stem
            local_stems_dir = OUTPUT_DIR / self.model / track_name
            base_url = f"https://{bucket_name}.s3.{self.aws_region}.amazonaws.com"
            stem_urls = {}

            print(f"Uploading stems from {local_stems_dir} to S3 for user '{username}'...")
            # Upload guitar and no_guitar stems
            for stem_name in ["guitar", "no_guitar"]:
                local_file_path = local_stems_dir / f"{stem_name}.wav"
                if local_file_path.exists():
                    stem_key = f"stems/{username}/{task_id}/{stem_name}.wav"
                    # Add ACL and ContentType to make the file public
                    self.s3_client.upload_file(
                        str(local_file_path),
                        bucket_name,
                        stem_key,
                        ExtraArgs={'ACL': 'public-read', 'ContentType': 'audio/wav'}
                    )
                    stem_urls[stem_name] = f"{base_url}/{stem_key}"
            
            if "no_guitar" in stem_urls:
                stem_urls["backingTrack"] = stem_urls.pop("no_guitar")

            # Create and upload the manifest.json 
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