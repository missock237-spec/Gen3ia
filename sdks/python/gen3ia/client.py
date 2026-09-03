"""Client GEN3IA API v1 — typé de bout en bout (Python 3.9+, urllib)."""
import json
import os
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

from .types_gen import Task, TaskStep, Transaction, ApiKey, Agent

BASE_URL = os.environ.get("GEN3IA_URL", "https://gen3ia.online")
API_KEY = os.environ.get("GEN3IA_API_KEY", "")


class Gen3iaError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class Gen3iaClient:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or API_KEY
        self.base_url = (base_url or BASE_URL).rstrip("/")
        if not self.api_key:
            raise Gen3iaError("GEN3IA_API_KEY manquante (param ou variable d'environnement)")

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.base_url + "/api/v1" + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.api_key},
        )
        try:
            with urllib.request.urlopen(req) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            raise Gen3iaError(f"GEN3IA {e.code} : {e.read().decode()[:500]}", e.code)

    def chat(self, message: str, agent_slug: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        return self._request("POST", "/chat", {
            "message": message,
            "agent_slug": agent_slug,
            "history": history or [],
        })

    def run_task(self, prompt: str, agent_slug: Optional[str] = None, wait: bool = True, poll_s: float = 2.0, timeout_s: float = 900.0) -> Dict[str, Any]:
        created = self._request("POST", "/task", {"prompt": prompt, "agent_slug": agent_slug, "mode": "async"})
        task_id = created["task_id"]
        if not wait:
            return {"id": task_id}
        deadline = time.time() + timeout_s
        while True:
            task = self._request("GET", "/task/" + task_id)
            if task.get("status") in ("COMPLETED", "FAILED", "CANCELLED"):
                return task
            if time.time() > deadline:
                raise Gen3iaError("Timeout d'attente de la tâche " + task_id, 408)
            time.sleep(poll_s)

    def get_task(self, task_id: str) -> Dict[str, Any]:
        return self._request("GET", "/task/" + task_id)

    def list_transactions(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/transactions")["transactions"]

    def list_api_keys(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/keys")["keys"]

    def list_agents(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/agents")["agents"]
