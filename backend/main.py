from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import os
import uuid
import json
from dotenv import load_dotenv
import boto3
from passlib.context import CryptContext
from typing import List, Optional
from pydantic import BaseModel
import shutil

from stem_separation import DemucsSeparator

load_dotenv()

# Hashes using bcrypt algorithm
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Initialize S3
s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)
BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION", "eu-west-2")
TEMP_UPLOAD_DIR = Path(__file__).parent / "temp_uploads"
TEMP_UPLOAD_DIR.mkdir(exist_ok=True)


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

class Bookmark(BaseModel):
    id: int
    time: float
    label: str

class SongMetadata(BaseModel):
    songTitle: str
    artist: Optional[str] = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generates a bcrypt hash"""
    return pwd_context.hash(password)

def upload_and_separate(temp_file_path: str, object_key: str, task_id: str, username: str, original_filename: str):
    """
    Background task that first uploads the file to S3, then starts separation
    """
    try:
        print(f"[{task_id}] Background task: Uploading {temp_file_path} to S3 bucket {BUCKET_NAME}...")
        s3_client.upload_file(temp_file_path, BUCKET_NAME, object_key)
        print(f"[{task_id}] Background task: S3 upload complete.")

        separator.separate_audio_stems(
            BUCKET_NAME,
            object_key,
            task_id,
            username,
            original_filename
        )
    except Exception as e:
        print(f"--- AN ERROR OCCURRED IN BACKGROUND TASK for task {task_id} ---")
        print(f"Error: {str(e)}")
    finally:
        print(f"[{task_id}] Background task: Cleaning up temporary file {temp_file_path}.")
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/register/", summary="Register a new user", status_code=201)
def register_user(username: str = Body(...), password: str = Body(...)):
    """
    Registers a new user
    """
    user_info_key = f"stems/{username}/user_info.json"
    
    # Check if user already exists
    try:
        s3_client.head_object(Bucket=BUCKET_NAME, Key=user_info_key)
        raise HTTPException(status_code=400, detail="Username already exists.")
    except s3_client.exceptions.ClientError as e:
        if e.response['Error']['Code'] == '404':
            pass
        else:
            raise HTTPException(status_code=500, detail="Error checking user existence.")

    hashed_password = get_password_hash(password)
    user_data = {"username": username, "hashed_password": hashed_password}

    # Store user info
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=user_info_key,
            Body=json.dumps(user_data),
            ContentType='application/json'
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not create user: {e}")

    return {"message": f"User '{username}' registered successfully."}

@app.post("/login/", summary="User login")
def login_user(username: str = Body(...), password: str = Body(...)):
    """
    Authenticates a user
    """
    user_info_key = f"stems/{username}/user_info.json"

    # Fetch user data from S3
    try:
        user_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=user_info_key)
        user_data = json.loads(user_obj['Body'].read().decode('utf-8'))
    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Invalid username or password.")

    # Verify the password
    if not verify_password(password, user_data.get("hashed_password")):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    return {"message": "Login successful", "username": username}


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
        
        temp_file_path = str(TEMP_UPLOAD_DIR / f"{task_id}{file_extension}")
        
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        object_key = f"uploads/{task_id}{file_extension}"

        # Pass original_filename to the background task
        background_tasks.add_task(
            upload_and_separate,
            temp_file_path,
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

@app.put("/{username}/{task_id}/bookmarks", summary="Save or update bookmarks for a project", status_code=200)
def save_project_bookmarks(username: str, task_id: str, bookmarks: List[Bookmark]):
    """
    Saves or overwrites the bookmarks for a given project
    """
    if not username or not task_id:
        raise HTTPException(status_code=400, detail="Username and Task ID are required.")

    bookmarks_key = f"stems/{username}/{task_id}/bookmarks.json"
    
    bookmarks_data = json.dumps([b.dict() for b in bookmarks])

    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=bookmarks_key,
            Body=bookmarks_data,
            ContentType='application/json',
            ACL='public-read'
        )
        return {"message": "Bookmarks saved successfully."}
    except Exception as e:
        print(f"Error saving bookmarks for user '{username}', task '{task_id}': {e}")
        raise HTTPException(status_code=500, detail="Could not save bookmarks.")


@app.put("/{username}/{task_id}/metadata", summary="Update project metadata", status_code=200)
def update_project_metadata(username: str, task_id: str, metadata: SongMetadata):
    """
    Updates the song title and artist
    """
    manifest_key = f"stems/{username}/{task_id}/manifest.json"

    try:
        manifest_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=manifest_key)
        manifest_data = json.loads(manifest_obj['Body'].read().decode('utf-8'))

        manifest_data['songTitle'] = metadata.songTitle
        manifest_data['artist'] = metadata.artist

        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=manifest_key,
            Body=json.dumps(manifest_data),
            ContentType='application/json',
            ACL='public-read'
        )
        return {"message": "Metadata updated successfully."}

    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Project manifest not found.")
    except Exception as e:
        print(f"Error updating metadata for user '{username}', task '{task_id}': {e}")
        raise HTTPException(status_code=500, detail="Could not update metadata.")


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
                
                # Use the saved songTitle from the manifest if it exists
                display_name = manifest_data.get("songTitle", manifest_data.get("originalFileName", "Unknown File"))

                projects.append({
                    "taskId": task_id,
                    "originalFileName": display_name,
                    "manifestUrl": f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{manifest_key}"
                })
            except s3_client.exceptions.NoSuchKey:
                print(f"Warning: Manifest file not found for task {task_id} of user {username}")
                continue
        
        projects.sort(key=lambda p: p['originalFileName'])
        return {"projects": projects}

    except Exception as e:
        print(f"Error fetching projects for user '{username}': {e}")
        raise HTTPException(status_code=500, detail="Could not fetch user projects.")