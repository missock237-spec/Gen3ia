# Corrections workflows GitHub

## 1. .github/workflows/ci.yml

Ajouter NEXTAUTH_SECRET au job build :
```yaml
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET || 'test-secret-key-32-characters-minimum!!' }}
```

Ajouter aussi HUGGINGFACE_TOKEN dans le build test :
```yaml
          HUGGINGFACE_TOKEN: test-hf-token
```

## 2. .github/workflows/security.yml

La reference `codeql-config.yml` n'existe pas. Modifier :
```yaml
      - uses: github/codeql-action/init@v4
        with:
          languages: javascript-typescript
```
(Enlever la ligne `config-file`)

## 3. .github/workflows/issues.yml

Remplacer `actions/stale@v10` (inexistant) par `actions/stale@v9`.
Remplacer `actions/first-interaction@v1` (deprecie) par `actions/github-script@v7`.

## 4. .github/workflows/main.yml

Remplacer HUGGINGFACE_API_KEY par :
```yaml
          HUGGINGFACE_TOKEN: ${{ secrets.HUGGINGFACE_TOKEN }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          SERPAPI_API_KEY: ${{ secrets.SERPAPI_API_KEY }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
```

## 5. Secrets GitHub a ajouter
Settings > Secrets > Actions :
- HUGGINGFACE_TOKEN
- GROQ_API_KEY
- OPENROUTER_API_KEY
- SERPAPI_API_KEY
- NEXTAUTH_SECRET
- ANTHROPIC_API_KEY
- ELEVENLABS_API_KEY