# gen3ia (Python)

SDK officiel GEN3IA — **dataclasses générées depuis le schéma Prisma**.

```bash
pip install .   # depuis sdks/python/
```

```python
from gen3ia import Gen3iaClient

client = Gen3iaClient(api_key="g3ia_live_...")
task = client.run_task("Analyse le marché des panneaux solaires", agent_slug="analyste-marche")
print(task["result"]["answer"])
```

Régénération : `node scripts/gen-sdk-types.mjs`
