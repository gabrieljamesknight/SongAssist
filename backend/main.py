from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import os
import uuid
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
def separate_audio(file: UploadFile, background_tasks: BackgroundTasks):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded.")
        
    try:
        file_extension = Path(file.filename).suffix if file.filename else ".tmp"
        task_id = str(uuid.uuid4())
        
        # Define the path for file in the S3 bucket
        object_key = f"uploads/{task_id}{file_extension}"

        # Upload file to S3 from memory
        s3_client.upload_fileobj(file.file, BUCKET_NAME, object_key)

        background_tasks.add_task(separator.separate_audio_stems, BUCKET_NAME, object_key, task_id)
        
        content = {
            "message": "Separation process started successfully.",
            "filename": file.filename,
            "taskId": task_id 
        }
        
        return JSONResponse(content=content)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if file:
            file.file.close()