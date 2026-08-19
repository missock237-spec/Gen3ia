import requests

class GenovaClient:
    """SDK Python pour la plateforme Genova AI"""

    def __init__(self, api_key: str, base_url: str = "https://genova.app/api"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {"Content-Type": "application/json", "x-api-key": api_key}

    def _request(self, method: str, path: str, body: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        r = requests.request(method, url, headers=self.headers, json=body)
        r.raise_for_status()
        return r.json()

    def create_agent(self, name: str, agent_type: str, description: str = "") -> dict:
        return self._request("POST", "/api/agents", {"name": name, "type": agent_type, "description": description})

    def list_agents(self, page: int = 1, limit: int = 20) -> dict:
        return self._request("GET", f"/api/agents?page={page}&limit={limit}")

    def execute_agent(self, agent_id: str, input_text: str, session_id: str = None) -> dict:
        return self._request("POST", "/api/agents/run", {"agentId": agent_id, "input": input_text, "sessionId": session_id})

    def generate_image(self, prompt: str, model: str = "flux-dev", width: int = 1024, height: int = 1024) -> dict:
        return self._request("POST", "/api/images/generate", {"prompt": prompt, "model": model, "width": width, "height": height})

    def generate_video(self, prompt: str, model: str = "ltx-video", num_frames: int = 25) -> dict:
        return self._request("POST", "/api/videos/generate", {"prompt": prompt, "model": model, "numFrames": num_frames})

    def generate_audio(self, text: str, model: str = "mms-fra") -> dict:
        return self._request("POST", "/api/audio/generate", {"text": text, "model": model})

    def get_plans(self) -> dict:
        return self._request("GET", "/api/payments/plans")

    def subscribe(self, plan_id: str, phone: str, operator: str) -> dict:
        return self._request("POST", "/api/payments/subscribe", {"planId": plan_id, "phone": phone, "operator": operator})
