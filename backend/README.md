---
title: StyleSense Backend
emoji: 🛍️
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# StyleSense Backend API

FastAPI-powered conversational AI engine and search pipeline for the StyleSense premium fashion e-commerce application.

## Hosting & Architecture
This repository is deployed directly as a custom Docker Space on **Hugging Face Spaces**. It runs:
* **FastAPI** as the API server framework.
* **OpenCLIP (ViT-B-32)** for multimodal semantic search (text-to-image and image-to-image).
* **Google Gemini 2.5 Flash** for Conversational AI, styling advice, and ticket state machines.
