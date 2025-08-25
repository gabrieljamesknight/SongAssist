from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import os
import uuid
import json
from dotenv import load_dotenv

load_dotenv()

import boto3
from passlib.context import CryptContext
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import shutil
from fastapi import Query
from gemini_client import analyze_guitar_file, generate_text_from_prompt
import requests
import tempfile
import urllib.parse

from stem_separation import DemucsSeparator



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

class IdentifyRequest(BaseModel):
    rawFileName: str

class AnalysisRequest(BaseModel):
    songTitle: str
    artist: Optional[str] = None

class AdviceRequest(BaseModel):
    songTitle: str
    artist: Optional[str] = None
    section: Optional[str] = None
    currentIsolation: Optional[str] = None
    difficulty: Optional[int] = None
    bookmarks: Optional[List[Dict[str, Any]]] = None

class TabsRequest(BaseModel):
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

@app.get("/project/{username}/{task_id}/manifest")
def get_project_manifest(username: str, task_id: str):
    manifest_key = f"stems/{username}/{task_id}/manifest.json"
    try:
        manifest_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=manifest_key)
        manifest_data = json.loads(manifest_obj['Body'].read().decode('utf-8'))
        return JSONResponse(content=manifest_data)
    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Manifest not yet available.")
    except Exception as e:
        print(f"Error fetching manifest for user '{username}', task '{task_id}': {e}")
        raise HTTPException(status_code=500, detail="Could not fetch project manifest.")

@app.get("/project/{username}/{task_id}/bookmarks") 
def get_project_bookmarks(username: str, task_id: str): 
    bookmarks_key = f"stems/{username}/{task_id}/bookmarks.json" 
    try: 
        bookmarks_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=bookmarks_key) 
        bookmarks_data = json.loads(bookmarks_obj['Body'].read().decode('utf-8')) 
        return JSONResponse(content=bookmarks_data) 
    except s3_client.exceptions.NoSuchKey: 
        return JSONResponse(content=[], status_code=404) 
    except Exception as e: 
        print(f"Error fetching bookmarks for user '{username}', task '{task_id}': {e}") 
        raise HTTPException(status_code=500, detail="Could not fetch project bookmarks.") 

@app.post("/gemini/identify-from-filename")
def identify_song(req_body: IdentifyRequest):
    system_prompt = """You are a music expert. Your task is to identify a song title and artist from a raw audio filename.
    The filename might contain track numbers, garbage text, or underscores. Clean it up and provide the most likely song title and artist.
    Respond ONLY with a JSON object in the format: {"songTitle": "...", "artist": "..."}.
    If you cannot determine the artist, use "Unknown Artist".
    """
    user_prompt = f"Filename: \"{req_body.rawFileName}\""
    response_data = generate_text_from_prompt(system_prompt, user_prompt, model_name="gemini-2.5-flash")
    try:
        json_text = response_data.get("text", "{}")
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0]
        parsed_json = json.loads(json_text)
        return parsed_json
    except (json.JSONDecodeError, IndexError):
        return {"songTitle": req_body.rawFileName, "artist": "Unknown Artist"}

@app.post("/gemini/initial-analysis")
def get_initial_analysis(req_body: AnalysisRequest):
    system_prompt = """You are a helpful and encouraging guitar practice assistant.
    A user has just loaded a song. Provide a brief, welcoming analysis (2-3 sentences).
    Mention the song's key characteristics, what makes it interesting to learn on guitar, and one or two key techniques to listen for.
    Keep it concise and positive.
    """
    user_prompt = f"The song is \"{req_body.songTitle}\" by {req_body.artist or 'an unknown artist'}."
    return generate_text_from_prompt(system_prompt, user_prompt, model_name="gemini-2.5-flash") # Specify flash model

@app.post("/gemini/playing-advice")
def get_playing_advice(req_body: AdviceRequest):
    system_prompt = """You are a helpful and encouraging guitar practice assistant. The user is asking for advice about playing a specific song.
    Use the provided context to give a clear, actionable, and encouraging response.
    Focus on techniques, practice strategies, or music theory relevant to their question.
    """
    context_parts = [f"The user is working on \"{req_body.songTitle}\" by {req_body.artist or 'an unknown artist'}."]
    if req_body.bookmarks:
        context_parts.append(f"They have set {len(req_body.bookmarks)} bookmarks.")
    if req_body.difficulty:
        context_parts.append(f"They perceive the difficulty as {req_body.difficulty}/10.")
    context_parts.append(f"\nUser's question: \"{req_body.section}\"")
    user_prompt = "\n".join(context_parts)
    return generate_text_from_prompt(system_prompt, user_prompt, model_name="gemini-2.5-flash")

@app.post("/gemini/generate-tabs")
def generate_tabs(req_body: TabsRequest):
    system_prompt = """You are an expert guitar tab generator.
    Your task is to create a simple, text-based (ASCII) guitar tab for the main riff or a key section of the requested song.
    Do not tab out the entire song. Focus on one or two iconic parts.
    Include a brief title (e.g., "Main Riff") and the tuning if it's not standard.
    Your output should be formatted as plain text suitable for a `<pre>` tag. Use markdown for code blocks.
    """
    user_prompt = f"Please generate tabs for \"{req_body.songTitle}\" by {req_body.artist or 'an unknown artist'}."
    return generate_text_from_prompt(system_prompt, user_prompt, model_name="gemini-2.5-flash")


@app.post("/gemini/analyze-stem")
def analyze_stem_with_gemini(
    username: str = Form(...),
    task_id: str = Form(...),
    prompt: str = Form(""),
):
    manifest_key = f"stems/{username}/{task_id}/manifest.json"
    try:
        obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=manifest_key)
        manifest = json.loads(obj["Body"].read().decode("utf-8"))
    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Project manifest not found.")
    stems = manifest.get("stems", {})
    guitar_url = stems.get("guitar") or stems.get("Guitar")
    if not guitar_url:
        raise HTTPException(status_code=400, detail="Guitar stem not found in manifest.")
    try:
        parsed_url = urllib.parse.urlparse(guitar_url)
        file_extension = Path(parsed_url.path).suffix or ".mp3"
        
        with tempfile.NamedTemporaryFile(suffix=file_extension, delete=False) as tmp:
            r = requests.get(guitar_url, timeout=60)
            r.raise_for_status()
            tmp.write(r.content)
            local_audio_path = tmp.name
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch stem: {e}")
    
    extra_ctx = None
    ess_key = f"stems/{username}/{task_id}/essentia.json"
    try:
        ess_obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=ess_key)
        extra_ctx = json.loads(ess_obj["Body"].read().decode("utf-8"))
    except s3_client.exceptions.NoSuchKey:
        extra_ctx = {"warning": "essentia.json not found"}

    try:
        result = analyze_guitar_file(
            local_audio_path,
            model_name="gemini-2.5-flash",
            user_prompt=prompt,
            extra_context_json=extra_ctx
        )
        
        if "error" in result:
            raise Exception(result["error"])

        result_key = f"stems/{username}/{task_id}/gemini_analysis.json"
        s3_client.put_object(
            Bucket=BUCKET_NAME, Key=result_key,
            Body=json.dumps(result), ContentType="application/json", ACL="public-read"
        )
        return {"ok": True, "result": result,
                "resultUrl": f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{result_key}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini analysis failed: {e}")


@app.post("/separate/", status_code=202)
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
                    "manifestUrl": f"https://{BUCKET_NAME}.s3.{AWS_REGION}[.amazonaws.com/](https://.amazonaws.com/){manifest_key}"
                })
            except s3_client.exceptions.NoSuchKey:
                print(f"Warning: Manifest file not found for task {task_id} of user {username}")
                continue
        
        projects.sort(key=lambda p: p['originalFileName'])
        return {"projects": projects}

    except Exception as e:
        print(f"Error fetching projects for user '{username}': {e}")
        raise HTTPException(status_code=500, detail="Could not fetch user projects.")