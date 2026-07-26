# Corrections securite applicables

## 1. Fichier .github/workflows/main.yml
Remplacer la section env par:

```yaml
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
        AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
        NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
        NEXT_PUBLIC_APP_URL: "http://localhost:3000"
        HUGGINGFACE_TOKEN: ${{ secrets.HUGGINGFACE_TOKEN }}
        GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
        OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
        SERPAPI_API_KEY: ${{ secrets.SERPAPI_API_KEY }}
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## 2. Secrets GitHub a ajouter (Settings > Secrets > Actions)
- HUGGINGFACE_TOKEN
- GROQ_API_KEY
- OPENROUTER_API_KEY
- SERPAPI_API_KEY
- NEXTAUTH_SECRET
- ANTHROPIC_API_KEY
- ELEVENLABS_API_KEY

## 3. package.json overrides
Les overrides de securite sont deja en place:
- jsonwebtoken: 9.0.2 (avec jose: 5.9.6 override)
- cookie: 0.7.2
- axios: 1.7.9
- cross-spawn: 7.0.6
- braces: 3.0.3
- ws: 8.17.1