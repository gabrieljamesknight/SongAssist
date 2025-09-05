def test_generate_text_from_prompt_handles_exception(monkeypatch):
    import backend.gemini_client as gc

    class FakeModel:
        def __init__(self, name):
            pass
        def generate_content(self, prompt):
            raise RuntimeError("boom")

    # Patch the GenerativeModel constructor
    fake_genai = type("G", (), {"GenerativeModel": FakeModel})
    monkeypatch.setattr(gc, "genai", fake_genai)

    out = gc.generate_text_from_prompt("sys", "user", "model-x")
    assert "error" in out
    assert "text" in out


def test_analyze_guitar_file_parses_json(monkeypatch, tmp_path):
    import backend.gemini_client as gc

    # Stub upload_file to return a placeholder
    class FakeUpload:
        pass

    # Fake response object
    class FakeFinish:
        name = "STOP"

    class FakeCandidate:
        def __init__(self, text):
            self.finish_reason = FakeFinish()

    class FakeResp:
        def __init__(self, text):
            self.text = text
            self.candidates = [FakeCandidate(text)]

    class FakeModel:
        def __init__(self, name):
            pass
        def generate_content(self, parts, generation_config=None, safety_settings=None):
            # Return a valid JSON payload as text
            return FakeResp('{"tuning":"E Standard","key":"C"}')

    fake_genai = type("G", (), {
        "GenerativeModel": FakeModel,
        "upload_file": lambda path: FakeUpload(),
    })
    monkeypatch.setattr(gc, "genai", fake_genai)

    # Create a temporary dummy file to "upload"
    p = tmp_path / "a.wav"
    p.write_bytes(b"data")

    out = gc.analyze_guitar_file(str(p), model_name="any")
    assert out.get("tuning") == "E Standard"
    assert out.get("key") == "C"

