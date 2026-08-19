Deploy to Render via webhook:
- Go to Render Dashboard > gen3ia-app > Settings > Deploy Hook
- Copy the Deploy Hook URL
- Set as GitHub Secret: RENDER_DEPLOY_HOOK_URL
- Create a GitHub Action workflow that POSTs to this URL on push to main