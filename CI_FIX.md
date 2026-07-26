# Correction CI/CD

## 1. Modifier .github/workflows/main.yml
Ouvrir le fichier sur GitHub et remplacer :

```yaml
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
        AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
        NEXT_PUBLIC_APP_URL: "http://localhost:3000"
        HUGGINGFACE_API_KEY: ${{ secrets.HUGGINGFACE_API_KEY }}
```

PAR :

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
```

## 2. Ajouter les secrets GitHub
Settings > Secrets and variables > Actions :
```
HUGGINGFACE_TOKEN (hf_...)
GROQ_API_KEY (gsk_...)
OPENROUTER_API_KEY (sk-or-...)
SERPAPI_API_KEY (serpapi_...)
NEXTAUTH_SECRET (32+ chars)
```