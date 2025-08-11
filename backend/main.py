from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import os
import shutil
import uuid

from stem_separation import DemucsSeparator

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

static_path = Path(__file__).parent / "separated_audio"
app.mount("/static", StaticFiles(directory=static_path), name="static")

separator = DemucsSeparator(model="htdemucs_6s")

@app.get("/", summary="Root endpoint")
def read_root():
    return {"message": "Welcome to SongAssist API! The server is running."}


@app.post("/separate/", summary="Separate audio stems", status_code=202)
def separate_audio(file: UploadFile, background_tasks: BackgroundTasks):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded.")
        
    temp_file_path = None
    try:
        file_extension = Path(file.filename).suffix if file.filename else ".tmp"
        task_id = str(uuid.uuid4())
        temp_file_path = separator.INPUT_DIR / f"{task_id}{file_extension}"

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        background_tasks.add_task(separator.separate_audio_stems, temp_file_path)
        
        content = {
            "message": "Separation process started successfully.",
            "filename": file.filename,
            "taskId": task_id 
        }

        headers = {
            "Access-Control-Allow-Origin": "*" 
        }
        
        return JSONResponse(content=content, headers=headers)

    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    finally:
        if file:
            file.file.close()