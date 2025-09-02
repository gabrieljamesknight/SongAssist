import json
from pathlib import Path


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_register_and_login_flow(client, fake_s3):
    # Register new user
    r = client.post("/register/", json={"username": "alice", "password": "pass123"})
    assert r.status_code == 201
    assert "registered" in r.json()["message"]

    # Duplicate register should fail
    r2 = client.post("/register/", json={"username": "alice", "password": "pass123"})
    assert r2.status_code == 400

    # Login success
    r3 = client.post("/login/", json={"username": "alice", "password": "pass123"})
    assert r3.status_code == 200
    assert r3.json()["username"] == "alice"

    # Wrong password
    r4 = client.post("/login/", json={"username": "alice", "password": "nope"})
    assert r4.status_code == 401

    # Unknown user
    r5 = client.post("/login/", json={"username": "bob", "password": "x"})
    assert r5.status_code == 404


def test_bookmarks_roundtrip(client):
    username = "u1"
    task_id = "t1"
    bookmarks = [
        {"id": 1, "start": 10.0, "end": 15.0, "label": "Riff"},
        {"id": 2, "start": 30.0, "end": 36.5, "label": "Chorus"},
    ]
    # Save
    r = client.put(f"/{username}/{task_id}/bookmarks", json=bookmarks)
    assert r.status_code == 200
    # Get
    r2 = client.get(f"/project/{username}/{task_id}/bookmarks")
    assert r2.status_code == 200
    assert r2.json() == bookmarks


def test_manifest_get_and_update_metadata(client, fake_s3):
    username = "john"
    task_id = "abc"
    manifest_key = f"stems/{username}/{task_id}/manifest.json"
    # Put initial manifest in fake S3
    fake_s3.put_object(Bucket="test-bucket", Key=manifest_key, Body=json.dumps({
        "songTitle": "Old Title",
        "artist": "Someone",
        "originalFileName": "file.mp3"
    }))

    # Get manifest endpoint
    r = client.get(f"/project/{username}/{task_id}/manifest")
    assert r.status_code == 200
    assert r.json()["songTitle"] == "Old Title"

    # Update metadata
    r2 = client.put(f"/{username}/{task_id}/metadata", json={
        "songTitle": "New Title",
        "artist": "New Artist"
    })
    assert r2.status_code == 200

    # Verify stored manifest updated
    updated = json.loads(fake_s3.storage[manifest_key].decode("utf-8"))
    assert updated["songTitle"] == "New Title"
    assert updated["artist"] == "New Artist"


def test_user_projects_listing(client, fake_s3):
    username = "sam"
    # Seed two projects with manifests
    for tid, title in [("id1", "Alpha"), ("id2", "Bravo")]:
        mkey = f"stems/{username}/{tid}/manifest.json"
        fake_s3.put_object(Bucket="test-bucket", Key=mkey, Body=json.dumps({
            "songTitle": title,
            "originalFileName": title
        }))
    # The S3 list API will discover task IDs from the keys
    r = client.get(f"/user/{username}/projects")
    assert r.status_code == 200
    data = r.json()["projects"]
    # Should contain both tasks and be sorted by originalFileName
    assert [p["taskId"] for p in data] == ["id1", "id2"]


def test_delete_project(client, fake_s3):
    username = "sara"
    task_id = "delme"
    prefix = f"stems/{username}/{task_id}/"
    # Seed some objects under the project
    for name in ["guitar.wav", "backingTrack.wav", "manifest.json"]:
        fake_s3.put_object(Bucket="test-bucket", Key=prefix + name, Body=b"x")
    assert any(k.startswith(prefix) for k in fake_s3.storage)

    r = client.delete(f"/project/{username}/{task_id}")
    assert r.status_code == 200
    # All objects under prefix removed
    assert not any(k.startswith(prefix) for k in fake_s3.storage)


def test_save_chord_analysis(client, fake_s3):
    username = "mike"
    task_id = "t42"
    manifest_key = f"stems/{username}/{task_id}/manifest.json"
    fake_s3.put_object(Bucket="test-bucket", Key=manifest_key, Body=json.dumps({
        "originalFileName": "whatever.mp3"
    }))

    body = "# My Analysis\nContent here"
    r = client.put(f"/{username}/{task_id}/analysis", data=body)
    assert r.status_code == 200

    # Manifest should be updated with userAnalysisUrl
    manifest = json.loads(fake_s3.storage[manifest_key].decode("utf-8"))
    assert "userAnalysisUrl" in manifest


def test_separate_audio_schedules_background(client, monkeypatch, fake_s3, tmp_path):
    # Patch the background function to record it was called
    called = {"value": False}

    import backend.main as main

    def fake_upload_and_separate(temp_file_path, object_key, task_id, username, original_filename, separator):
        # Background job executed after response
        called["value"] = True
        # Also store that an upload would have happened
        fake_s3.put_object(Bucket="test-bucket", Key=object_key, Body=b"data")

    monkeypatch.setattr(main, "upload_and_separate", fake_upload_and_separate)

    # Send a small file upload
    files = {"file": ("song.mp3", b"FAKEAUDIO", "audio/mpeg")}
    data = {"username": "alice"}
    r = client.post("/separate/", files=files, data=data)
    assert r.status_code == 202
    js = r.json()
    assert js["filename"] == "song.mp3"
    assert "taskId" in js

    # Background should have run, marking called True
    assert called["value"]

