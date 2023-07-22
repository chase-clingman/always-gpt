<template>
  <q-bar
    class="q-electron-drag bg-accent"
    style="position: fixed; top: 0; z-index: 5; width: 100%"
  >
    <!-- btn to expand leftdrawer -->
    <q-btn
      flat
      round
      dense
      icon="menu"
      @click="leftDrawerOpen = !leftDrawerOpen"
    />
    <q-space />
    <div class="text-center">AlwaysGPT</div>
    <q-space />
    <!-- <q-btn flat round dense icon="close" @click="minimize" /> -->
    <q-btn flat round dense icon="add" @click="resetChat" />
  </q-bar>
  <q-drawer v-model="leftDrawerOpen" side="left" behavior="mobile" bordered>
    <q-card>
      <q-list class="text-subtitle2">
        <q-item class="text-h6">HotKeys</q-item>
        <q-item>Control + Space - Opens AlwaysGPT</q-item>
        <q-item
          >Control + V - Paste Clipboard (Image or Text)</q-item
        >
        <q-item
          >Control + B - Input last 20 seconds of mic audio directly
          into chatGPT</q-item
        >
      </q-list>
    </q-card>
    <!-- drawer content -->
  </q-drawer>
  <q-page class="page">
    <!-- <q-space /> -->
    <div class="chat-container">
      <q-scroll-area style="height: 100%" ref="scrollArea">
        <MessageCard
          v-for="(message, index) in messages"
          :key="index"
          :message="message"
          class="message"
        />
        <div class="text-center q-pt-lg">
          <q-btn-group v-if="!messages.length" style="width: 200px">
            <q-btn
              style="width: 100%"
              label="gpt-3.5"
              :class="{ 'bg-secondary': selectedModel === 'gpt-3.5-turbo' }"
              @click="selectedModel = 'gpt-3.5-turbo'"
            />
            <q-btn
              style="width: 100%"
              label="gpt-4"
              :class="{ 'bg-secondary': selectedModel === 'gpt-4' }"
              @click="selectedModel = 'gpt-4'"
            />
          </q-btn-group>
        </div>
      </q-scroll-area>

      <!-- <q-card
        class="chat-window q-ma-md"
        flat
        style="background: #232120"
        ref="chatWindow"
      >
        <MessageCard
          v-for="(message, index) in messages"
          :key="index"
          :message="message"
        />
      </q-card> -->

      <div class="form-container">
        <q-form
          class="form"
          style="max-width: 800px; width: 100%"
          @submit="completionCall(input)"
        >
          <div
            class="text-center tooltip"
            style="font-size: 12px; margin-bottom: -10px"
            v-if="selectedDevice"
          >
            {{ selectedDevice.label }}
            <q-tooltip anchor="top middle" self="bottom middle"
              >'Ctrl + Space' to input last 20 seconds of audio.
            </q-tooltip>
          </div>
          <input
            ref="fileInput"
            id="fileInput"
            type="file"
            @change="onFileChange($event)"
            style="display: none"
          />

          <q-input
            ref="messageInput"
            rounded
            standout="bg-primary text-white"
            v-model="input"
            placeholder="Type a message"
            class="q-ma-md text-white"
            style="line-height: 1.5rem"
            @paste="handlePaste"
          >
            <template v-slot:prepend>
              <q-btn
                flat
                color="secondary"
                icon="attach_file"
                @click="fileInput.click()"
              />
            </template>
            <template v-slot:append>
              <q-btn flat color="secondary" dense icon="mic">
                <q-menu>
                  <q-list style="min-width: 200px">
                    <q-item
                      v-for="device in audioInputDevices"
                      :key="device.deviceId"
                      clickable
                      v-close-popup
                      @click="selectedDevice = device"
                    >
                      <q-item-section>{{ device.label }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>

              <q-btn
                flat
                color="secondary"
                icon="send"
                @click="completionCall(input)"
              />
            </template>
          </q-input>
        </q-form>
      </div>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, nextTick, watch } from "vue";

import { useQuasar } from "quasar";
import axios from "axios";
import { Configuration, OpenAIApi } from "openai";
import { OpenAI } from "openai-streams";

import { onMounted, onBeforeUnmount } from "vue";

import MessageCard from "../components/MessageCard.vue";

import { Notify } from "quasar";

import Tesseract from "tesseract.js";

export default defineComponent({
  name: "IndexPage",

  components: {
    MessageCard,
  },
  setup() {
    const messages = ref([]);
    const $q = useQuasar();
    const audioChunks = ref([]);
    let audioStream = null;
    let recorder = null;
    let OPENAI_API_KEY = "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";
    let transcript = ref("");
    let input = ref("");
    let selectedDevice = ref(null);
    let selectedFile = ref(null);
    let fileInput = ref(null);
    const leftDrawerOpen = ref(false);
    let selectedModel = ref("gpt-3.5-turbo");

    const messageInput = ref(null);

    function minimize() {
      if (process.env.MODE === "electron") {
        window.myWindowAPI.minimize();
      }
    }

    function toggleMaximize() {
      if (process.env.MODE === "electron") {
        window.myWindowAPI.toggleMaximize();
      }
    }

    function closeApp() {
      if (process.env.MODE === "electron") {
        window.myWindowAPI.close();
      }
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
      window.addEventListener("processAudio", processAudio); // Listen to the custom 'processAudio' event.
      // window.addEventListener("handlePaste", handlePaste);
      window.myWindowAPI.handleShortcut(() => {
        nextTick(() => {
          messageInput.value.focus();
        });
      });
    });

    let audioInputDevices = ref([]);

    onMounted(async () => {
      audioInputDevices.value = await getAudioInputDevices();
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("processAudio", processAudio); // Stop listening to the custom 'processAudio' event.
      window.myWindowAPI.handleShortcut(null);
    });

    const getAudioInputDevices = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const filteredDevices = devices.filter(
        (device) => device.kind === "audioinput"
      );
      console.log("Audio Input Devices: ", filteredDevices); // Debug statement
      return filteredDevices;
    };

    const mouseEnter = () => {
      window.electron.mouseOver();
    };

    const mouseLeave = () => {
      window.electron.mouseLeave();
    };

    const onKeydown = (event) => {
      // if (event.key === "p") {
      //   processAudio();
      // }
    };

    const resetChat = () => {
      messages.value = []; // This will empty your messages array
      startRecording();
    };

    // Inside your setup() function:
    const chatWindow = ref(null);

    const scrollArea = ref(null);

    watch(
      messages,
      () => {
        nextTick(() => {
          scrollArea.value.setScrollPosition("vertical", 999999, 300);
        });
      },
      { deep: true }
    );

    watch(selectedDevice, (newVal, oldVal) => {
      if (newVal !== oldVal) {
        stopRecording(); // stop the old recording
        startRecording(); // start a new recording with the new device
      }
    });

    // Inside the setup() function
    // Inside the setup() function
    const onFileChange = (event) => {
      selectedFile.value = event.target.files[0];
      transcribeFile();
    };

    const transcribeFile = (blob = null) => {
      console.log("File selected");
      const reader = new FileReader();
      reader.onload = async function (e) {
        if (reader.readyState === 2) {
          console.log("File loaded");
          const image = new Image();
          image.onload = async function () {
            console.log("Image loaded");
            Tesseract.recognize(image, "eng", {
              logger: (m) => console.log(m),
            }).then(({ data: { text } }) => {
              // Feed the text to OpenAI model
              console.log("Text: ", text);
              // set input to text
              input.value = text;
              // completionCall(text);
            });
          };
          image.src = e.target.result;
        } else {
          console.log("File loading is not completed yet.");
        }
      };

      // If a blob is passed, use it, else use selectedFile.value
      reader.readAsDataURL(blob || selectedFile.value);

      // If no blob is passed, do the following to reset input for file upload
      if (!blob) {
        nextTick(() => {
          let file = selectedFile.value;
          selectedFile.value = null;
          selectedFile.value = file;
          selectedFile.value = null;
        });
      }
    };

    const stopRecording = () => {
      if (recorder) {
        recorder.stop();
        if (audioStream) {
          const tracks = audioStream.getTracks();
          tracks.forEach((track) => track.stop());
        }
      }
    };

    const completionCall = async (message) => {
      message = message || input.value;
      messages.value.push({ role: "user", content: message });

      const stream = await OpenAI(
        "chat",
        {
          model: selectedModel.value,
          messages: messages.value,
        },
        {
          apiKey: process.env.VUE_APP_OPENAI_API_KEY || OPENAI_API_KEY,
        }
      );

      let buffer = "";
      let firstChunk = true;
      messages.value.push({ role: "assistant", content: "" });

      for await (const chunk of streamToAsyncIterable(stream)) {
        const decoder = new TextDecoder();
        const text = decoder.decode(chunk);

        buffer += text;
        const words = buffer.split(" ");
        if (words.length > 1) {
          const incompleteWord = words.pop();
          const completeWords = words.join(" ");

          if (firstChunk) {
            messages.value[messages.value.length - 1].content +=
              "" + completeWords;
            firstChunk = false;
          } else {
            messages.value[messages.value.length - 1].content +=
              " " + completeWords;
          }

          buffer = incompleteWord;
        }
      }

      if (buffer.length > 0) {
        messages.value[messages.value.length - 1].content += " " + buffer;
      }

      input.value = "";
    };

    const startRecording = async () => {
      try {
        const constraints = {
          audio: selectedDevice.value
            ? { deviceId: { exact: selectedDevice.value.deviceId } }
            : true,
        };
        audioStream = await navigator.mediaDevices.getUserMedia(constraints);
        // audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(audioStream);
        recorder.addEventListener("dataavailable", (event) => {
          const now = Date.now();
          audioChunks.value.push({ data: event.data, timestamp: now });
        });
        recorder.start(1000);
      } catch (error) {
        console.log(error);
        $q.notify({
          message: "Error: " + error.message,
          type: "negative",
          position: "top",
        });
      }
    };
    startRecording();

    async function* streamToAsyncIterable(stream) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }

    const processAudio = async () => {
      try {
        recorder.stop();
        stopRecording(); // stop the old recording
        const audioBlob = new Blob(
          audioChunks.value.map((chunk) => chunk.data),
          { type: "audio/webm" }
        );
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64audio = reader.result.split(",")[1];
          const formData = new FormData();
          formData.append("audio", base64audio);
          try {
            const response = await axios.post(
              "http://127.0.0.1:5000/api/transcribe",
              formData,
              {
                headers: { "Content-Type": "multipart/form-data" },
              }
            );
            if (response.data.success != false) {
              transcript.value = response.data.transcript;
              await completionCall(transcript.value.text);
            }
          } catch (error) {
            console.error(
              "Transcription failed, restarting recording...",
              error
            );
            $q.notify({
              color: "red-5",
              textColor: "white",
              icon: "warning",
              message: "Transcription error. Please try again.",
            });
            audioChunks.value = [];
            startRecording();
          }
        };
      } catch (error) {
        console.error("Failed to process audio", error);
      }
    };

    const handlePaste = (event) => {
      const items = (event.clipboardData || event.originalEvent.clipboardData)
        .items;
      for (let index in items) {
        const item = items[index];
        if (item.kind === "file" && item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          // Pass the blob directly to transcribeFile
          transcribeFile(blob);
        }
      }
    };

    return {
      input,
      transcript,
      messages,
      startRecording,
      processAudio,
      completionCall,
      mouseEnter,
      mouseLeave,
      minimize,
      toggleMaximize,
      closeApp,
      chatWindow, // <- add this line
      resetChat,
      scrollArea,

      selectedDevice,
      audioInputDevices,

      stopRecording,

      selectedFile,
      onFileChange,
      fileInput,

      leftDrawerOpen,
      toggleLeftDrawer() {
        leftDrawerOpen.value = !leftDrawerOpen.value;
      },

      handlePaste,
      selectedModel,
      messageInput
    };
  },
});
</script>

<style scoped>
.center {
  margin-left: auto;
  margin-right: auto;
}
.chat-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Align items to the bottom */
  padding-top: 20px;
  height: calc(100vh - 100px); /* Subtract the height of your q-bar */
}

.chat-window {
  overflow-y: auto;
  height: 70%;
  margin-bottom: 20px;
}
.message-container {
  display: flex;
  flex-direction: column;
}
.message {
  display: block;
  white-space: pre-wrap;
  line-height: 1.5;
  padding: 20px;
}

.form {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.form-container {
  flex-shrink: 0; /* Don't shrink this container, make it take only the space it needs */
}

.q-scroll-area {
  flex-grow: 1; /* Grow to fill the remaining space */
}

.tooltip {
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.3);
}
</style>
