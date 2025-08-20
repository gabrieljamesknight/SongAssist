from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import os
import uuid
import json
from dotenv import load_dotenv
import boto3

from stem_separation import DemucsSeparator

load_dotenv()

# Initialize S3
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)
BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION", "eu-west-2")


app = FastAPI(
    title="SongAssist API",
    description="An API for separating audio stems using Demucs.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5176"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

separator = DemucsSeparator(model="htdemucs_6s")

@app.get("/", summary="Root endpoint")
def read_root():
    return {"message": "Welcome to SongAssist API! The server is running."}


@app.post("/separate/", summary="Separate audio stems", status_code=202)
def separate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    username: str = Form(...)
):
    if not file or not username:
        raise HTTPException(status_code=400, detail="No file or username provided.")
        
    try:
        original_filename = file.filename
        file_extension = Path(original_filename).suffix if original_filename else ".tmp"
        task_id = str(uuid.uuid4())
        
        # Define the path for file in the S3 bucket
        object_key = f"uploads/{task_id}{file_extension}"

        # Upload file to S3 from memory
        s3_client.upload_fileobj(file.file, BUCKET_NAME, object_key)

        # Pass original_filename to the background task
        background_tasks.add_task(
            separator.separate_audio_stems,
            BUCKET_NAME,
            object_key,
            task_id,
            username,
            original_filename
        )
        
        content = {
            "message": "Separation process started successfully.",
            "filename": original_filename,
            "taskId": task_id 
        }
        
        return JSONResponse(content=content)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if file:
            file.file.close()


@app.get("/user/{username}/projects", summary="Get all projects for a user")
def get_user_projects(username: str):
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty.")

    projects = []
    try:
        prefix = f"stems/{username}/"
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, Delimiter='/')

        if 'CommonPrefixes' not in response:
            return {"projects": []}

        for prefix_info in response.get('CommonPrefixes', []):
            task_id = prefix_info.get('Prefix').split('/')[-2]
            manifest_key = f"stems/{username}/{task_id}/manifest.json"
            
            try:
                manifest_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=manifest_key)
                manifest_data = json.loads(manifest_obj['Body'].read().decode('utf-8'))
                
                projects.append({
                    "taskId": task_id,
                    "originalFileName": manifest_data.get("originalFileName", "Unknown File"),
                    "manifestUrl": f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{manifest_key}"
                })
            except s3_client.exceptions.NoSuchKey:
                print(f"Warning: Manifest file not found for task {task_id} of user {username}")
                continue
        
        # Sort projects by filename
        projects.sort(key=lambda p: p['originalFileName'])
        return {"projects": projects}
        
    except Exception as e:
        print(f"Error fetching projects for user '{username}': {e}")
        return {"projects": []}