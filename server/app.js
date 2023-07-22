const express = require('express');
const cors = require('cors');
const openai = require('openai-node');
const fs = require('fs');
const tmp = require('tmp');
const util = require('util');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const multer = require('multer');
const upload = multer();

require('dotenv').config();

const app = express();
app.use(cors());

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiClient = new openai.ApiClient(openaiApiKey);

app.post('/api/transcribe', upload.none(), async (req, res) => {
  const base64audio = req.body.audio;
  const audioBuffer = Buffer.from(base64audio, 'base64');

  // Create a temporary file to write the audio data to
  const tempAudioFile = tmp.fileSync({ postfix: '.webm' });
  fs.writeFileSync(tempAudioFile.name, audioBuffer);

  // Cut down to the last 10 seconds
  const tempCutAudioFile = tmp.fileSync({ postfix: '.webm' });
  await execPromise(`ffmpeg -y -i ${tempAudioFile.name} -t 10 -c copy ${tempCutAudioFile.name}`);

  try {
    // Send the data to the Whisper ASR API
    const transcript = await openaiClient.transcribe(tempCutAudioFile.name);

    // If the request was successful, return the transcript
    res.json({
      success: true,
      transcript,
    });
  } catch (e) {
    console.error("Exception occurred", e);
    res.status(500).json({
      success: false,
      message: e.message,
    });
  } finally {
    // Delete the temp files
    fs.unlinkSync(tempAudioFile.name);
    fs.unlinkSync(tempCutAudioFile.name);
  }
});

app.listen(3000, () => console.log('Listening on port 3000...'));
