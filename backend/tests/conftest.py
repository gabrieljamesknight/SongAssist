import io
import json
import os
import types
import pytest
from fastapi.testclient import TestClient


class FakeS3Client:
    class exceptions:
        class ClientError(Exception):
            def __init__(self, code):
                self.response = {"Error": {"Code": str(code)}}

        class NoSuchKey(Exception):
            pass

    def __init__(self):
        self.storage = {} 

    # Simple helpers
    def _ensure_bytes(self, body):
        if body is None:
            return b""
        if isinstance(body, (bytes, bytearray)):
            return bytes(body)
        if isinstance(body, str):
            return body.encode("utf-8")
        return json.dumps(body).encode("utf-8")

    # S3-like methods used by the app
    def head_object(self, Bucket, Key):
        if Key not in self.storage:
            raise self.exceptions.ClientError(404)
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def put_object(self, Bucket, Key, Body, **kwargs):
        self.storage[Key] = self._ensure_bytes(Body)
        return {"ResponseMetadata": {"HTTPStatusCode": 200}}

    def get_object(self, Bucket, Key):
        if Key not in self.storage:
            raise self.exceptions.NoSuchKey()
        return {"Body": io.BytesIO(self.storage[Key])}

    def list_objects_v2(self, Bucket, Prefix="", Delimiter=None):
        keys = [k for k in self.storage.keys() if k.startswith(Prefix)]
        response = {"KeyCount": len(keys)}
        if Delimiter:
            children = set()
            for k in keys:
                remainder = k[len(Prefix):]
                if "/" in remainder:
                    child = remainder.split("/", 1)[0]
                    children.add(child)
            response["CommonPrefixes"] = [{"Prefix": f"{Prefix}{c}/"} for c in sorted(children)]
        else:
            response["Contents"] = [{"Key": k} for k in keys]
        return response

    def delete_objects(self, Bucket, Delete):
        errs = []
        for obj in Delete.get("Objects", []):
            k = obj.get("Key")
            if k in self.storage:
                del self.storage[k]
            else:
                errs.append({"Key": k, "Code": "NoSuchKey"})
        resp = {}
        if errs:
            resp["Errors"] = errs
        return resp

    def upload_file(self, Filename, Bucket, Key, ExtraArgs=None):
        with open(Filename, "rb") as f:
            self.storage[Key] = f.read()

    def download_file(self, Bucket, Key, Filename):
        if Key not in self.storage:
            raise self.exceptions.NoSuchKey()
        os.makedirs(os.path.dirname(Filename), exist_ok=True)
        with open(Filename, "wb") as f:
            f.write(self.storage[Key])


@pytest.fixture()
def fake_s3():
    return FakeS3Client()


@pytest.fixture(autouse=True)
def patch_s3_and_bucket(monkeypatch, fake_s3):
    import backend.main as main
    monkeypatch.setattr(main, "s3_client", fake_s3)
    monkeypatch.setattr(main, "BUCKET_NAME", "test-bucket")
    yield


@pytest.fixture()
def client():
    from backend.main import app
    return TestClient(app)

