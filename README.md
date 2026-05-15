<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6eec5115-8f8d-438a-af51-d05f82e3f420

## Run Locally

**Prerequisites:**  Node.js


1. **Prepara l'ambiente Python 3.13**:
   `./setup_env.sh`
2. **Installa le dipendenze frontend**:
   `pnpm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key (optional for local LLM)
3. **Avvia tutto con un solo comando**:
   `pnpm start`

Questo comando avvierà contemporaneamente:
- Il server LLM locale (porta 1235)
- Il backend FastAPI (porta 8000)
- Il frontend Vite (porta 3000)

