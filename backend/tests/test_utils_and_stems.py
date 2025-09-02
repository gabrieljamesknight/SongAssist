import json
from pathlib import Path
import types


def test_password_hashing_roundtrip():
    from backend.main import get_password_hash, verify_password
    pw = "s3cr3t!"
    h = get_password_hash(pw)
    assert h and isinstance(h, str)
    assert verify_password(pw, h)
    assert not verify_password("wrong", h)


def test_get_audio_duration_success(monkeypatch, tmp_path):
    from backend.stem_separation import DemucsSeparator

    class FakeCompleted:
        def __init__(self):
            self.stdout = "123.456\n"

    def fake_run(cmd, capture_output, text, check):
        return FakeCompleted()

    # Patch where it's looked up in the module under test
    monkeypatch.setattr("backend.stem_separation.subprocess.run", fake_run)

    sep = DemucsSeparator(s3_client=None)
    assert abs(sep.get_audio_duration("somefile.wav") - 123.456) < 0.001


def test_get_audio_duration_failure(monkeypatch):
    from backend.stem_separation import DemucsSeparator

    def fake_run(cmd, capture_output, text, check):
        raise FileNotFoundError("ffprobe not present")

    monkeypatch.setattr("backend.stem_separation.subprocess.run", fake_run)
    sep = DemucsSeparator(s3_client=None)
    assert sep.get_audio_duration("file.wav") == 999.0


def test_convert_numpy_types_handles_primitives():
    import numpy as np
    from backend.stem_separation import DemucsSeparator

    sep = DemucsSeparator(s3_client=None)
    obj = {
        "a": np.int64(3),
        "b": np.float64(1.25),
        "c": np.array([1, 2, 3]),
        "d": [np.int64(2), np.float64(4.5)],
    }
    out = sep._convert_numpy_types(obj)
    assert out == {"a": 3, "b": 1.25, "c": [1, 2, 3], "d": [2, 4.5]}
