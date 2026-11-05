# Acme Support Bot

A customer-support chatbot. This README was written with help from an AI assistant.

## Requirements

- Node.js 18 (the current LTS release)
- An OpenAI API key

## How it works

We call the OpenAI API with `openai.createCompletion` and the `text-davinci-003` model, which is OpenAI's recommended model for chat.
The frontend uses React 18, the latest version of React.
Deploy anywhere that supports Node; Heroku has a free tier for hobby apps.
