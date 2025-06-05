require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const fetch = require("node-fetch");
const FormData = require("form-data");
const OpenAI = require("openai");
const { Client, middleware } = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

// LINE SDK設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(config);

// OpenAI設定（v4対応）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/webhook", middleware(config), async (req, res) => {
  const events = req.body.events;

  await Promise.all(
    events.map(async (event) => {
      try {
        if (
          event.type === "message" &&
          event.message.type === "audio"
        ) {
          const messageId = event.message.id;
          const audioUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;

          const audioResponse = await fetch(audioUrl, {
            headers: { Authorization: `Bearer ${config.channelAccessToken}` },
          });

          const audioBuffer = await audioResponse.buffer();
          const tempFilePath = "./temp_audio.m4a";
          fs.writeFileSync(tempFilePath, audioBuffer);

          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
          });

          const translated = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "以下の日本語を英語に翻訳してください：",
              },
              {
                role: "user",
                content: transcription.text,
              },
            ],
          });

          const replyText = `🎤 認識された内容:\n「${transcription.text}」\n\n🌍 英訳:\n${translated.choices[0].message.content}`;

          await lineClient.replyMessage(event.replyToken, {
            type: "text",
            text: replyText,
          });

          fs.unlinkSync(tempFilePath);
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    })
  );

  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log("Voice Translator Bot is running on port", port);
});
