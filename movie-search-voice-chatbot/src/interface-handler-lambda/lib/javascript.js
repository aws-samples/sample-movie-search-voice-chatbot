const marshaller = require('@aws-sdk/eventstream-marshaller'); // for converting binary event stream messages to and from JSON
const util_utf8_node = require('@aws-sdk/util-utf8-node'); // utilities for encoding and decoding UTF8
const { url } = require('inspector');
const mic = require('microphone-stream'); // collect microphone input as a stream of raw bytes

const eventStreamMarshaller = new marshaller.EventStreamMarshaller(
  util_utf8_node.toUtf8,
  util_utf8_node.fromUtf8
);
const audioDiv = document.getElementById('polly');
const messagesDiv = document.getElementById('messages');
const statusDiv = document.getElementById('status');
const inputText = document.getElementById('inputText');
const websocketApplicationQueue = [];
const websocketQueue = [];
const pathWebsocketApplicationUrl = 'get_websocket_url';
const pathRingToneUrl = 'assets/audio/start_tone.wav';
const pathEmptyToneUrl = 'assets/audio/empty_tone.wav';
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let websocketApplication;
let websocketApplicationUrl;
let websocketTranscribe;
let websocketTranscribeUrl;
let isQueueProcessing = false;
let isSpeaking = false;
let isListening = false;
let micStream;
let micSampleRate;
let transcribeSampleRate = 16000;
let transcription = '';
let utteranceLastEvent;
let utterance = '';
let allowAudioInput = true;
let allowAudioInputOnly = true;
let isListeningKeyDown = false;

/**
 * Logs messages to console if debug flag is enabled
 * @param {string} log - Message to log to console
 */
function consoleLogger(log) {
  if (urlParams.has('debug') && urlParams.get('debug') === 'true') {
    console.log(log);
  }
}

/**
 * Logs reasoning messages to console if debug or reasoning flags are enabled
 * @param {string} log - Reasoning message to log to console
 */
function reasoningLogger(log) {
  if (
    (urlParams.has('debug') && urlParams.get('debug') === 'true') ||
    (urlParams.has('reasoning') && urlParams.get('reasoning') === 'true')
  ) {
    console.log(log);
  }
}

if (!window.navigator.mediaDevices.getUserMedia) {
  consoleLogger('Browser not supported for media');
} else {
  consoleLogger('Browser supported for media');
  updateStatus('Stopped', 'success', 'slash-square');
  document.getElementById('speakButton').disabled = true;
  document.getElementById('inputText').value = '';
  document.getElementById('inputText').disabled = false;
  document.getElementById('sendButton').disabled = true;
  if (!allowAudioInput) {
    document.getElementById('startProcessButton').style.display = 'none';
    document.getElementById('stopProcessButton').style.display = 'none';
    document.getElementById('speakButton').style.display = 'none';
    document.getElementById('inputText').style.borderTopLeftRadius = '0.5rem';
    document.getElementById('inputText').style.borderBottomLeftRadius =
      '0.5rem';
  } else if (allowAudioInputOnly) {
    document.getElementById('input-controls').style.display = 'none';
  }
  websocketApplicationConnect();
}

function audioPlay(url, type) {
  audioDiv.src = url;
  audioDiv.type = type;
  audioDiv.play();
}

audioDiv.addEventListener('playing', () => {
  isSpeaking = true;
  document.getElementById('stopProcessButton').disabled = true;
  let type = audioDiv.type;
  if (type === 'FEEDBACK') {
    consoleLogger('Audio: PLAYING_FEEDBACK');
    updateStatus('Generating Feedback', 'success', 'megaphone');
  } else if (type === 'RESPONSE') {
    consoleLogger('Audio: PLAYING_RESPONSE');
    updateStatus('Speaking', 'success', 'volume-up');
  }
});

audioDiv.addEventListener('ended', () => {
  isSpeaking = false;
  document.getElementById('stopProcessButton').disabled = false;
  consoleLogger('Audio: ENDED');
  queueProcessorCompletedAction();
});

/**
 * Completes the queue processing action by resetting isQueueProcessing flag and triggering next queue item
 */
function queueProcessorCompletedAction() {
  isQueueProcessing = false;
  queueProcessor(null);
}

/**
 * Displays text messages in the UI with different styling based on message type
 * @param {string} text - The text content to display
 * @param {string} type - The type of message (utterance, response, feedback, wait, error)
 * @param {string} url - Optional URL for image content
 */
function displayText(text, type, url = null) {
  let lastMessage = document.getElementById('messages').lastChild;
  if (lastMessage && lastMessage.classList.contains(type.toLowerCase())) {
    let messageText;
    if (type.toLowerCase() === 'utterance') {
      messageText = lastMessage.firstChild;
      messageText.textContent += ` ${text}`;
    } else if (type.toLowerCase() === 'response' && url !== null) {
      messageText = lastMessage.lastChild;
      messageText.innerHTML += ` <img src="${url}" />`;
    } else if (type.toLowerCase() === 'response') {
      messageText = lastMessage.lastChild;
      messageText.innerHTML += String.raw`${text}`;
    } else if (type.toLowerCase() === 'feedback') {
      messageText = lastMessage.lastChild;
      messageText.textContent += ` ${text}`;
    }
  } else {
    if (lastMessage && lastMessage.classList.contains('wait')) {
      lastMessage.remove();
    }

    let messageContainerDiv = document.createElement('div');
    messageContainerDiv.className = `message-container ${type.toLowerCase()}`;

    let messageTextDiv = document.createElement('div');
    messageTextDiv.className = `message ${type.toLowerCase()}`;
    messageTextDiv.innerHTML += String.raw`${text}`;

    let messageIconDiv = document.createElement('div');
    if (type.toLowerCase() === 'utterance') {
      messageIconDiv.className = 'message-icon-left';
      messageIconDiv.innerHTML =
        '<img class="memoji" src="../assets/img/memoji-person.png" />';
      messageContainerDiv.appendChild(messageTextDiv);
      messageContainerDiv.appendChild(messageIconDiv);
    } else if (type.toLowerCase() === 'response') {
      messageIconDiv.className = 'message-icon-right';
      messageIconDiv.innerHTML =
        '<img class="memoji" src="../assets/img/memoji-video.png" />';
      messageContainerDiv.appendChild(messageIconDiv);
      messageContainerDiv.appendChild(messageTextDiv);
    } else if (type.toLowerCase() === 'feedback') {
      messageIconDiv.className = 'message-icon-right';
      messageIconDiv.textContent = '🤖';
      messageContainerDiv.appendChild(messageTextDiv);
      messageContainerDiv.appendChild(messageIconDiv);
    } else if (type.toLowerCase() === 'wait') {
      messageTextDiv.className = `loader message-waiting ${type.toLowerCase()}`;
      messageTextDiv.textContent = '';
      messageIconDiv.className = 'message-icon-left';
      messageIconDiv.textContent = '';
      messageContainerDiv.appendChild(messageTextDiv);
      messageContainerDiv.appendChild(messageIconDiv);
    } else if (type.toLowerCase() === 'error') {
      messageTextDiv.textContent = '';
      messageIconDiv.className = 'message-icon-left';
      messageIconDiv.textContent = 'An error occurred. Please try again.🚨';
      messageContainerDiv.appendChild(messageTextDiv);
      messageContainerDiv.appendChild(messageIconDiv);
    }
    document.getElementById('messages').appendChild(messageContainerDiv);
  }
  messagesDiv.scrollIntoView(false);
}

/**
 * Processes items in the websocket queue sequentially
 * @param {Object} data - Queue item to process containing action and value
 */
function queueProcessor(data) {
  if (data) {
    websocketQueue.push(data);
  }
  if (websocketQueue.length && !isQueueProcessing) {
    consoleLogger(`Queue Size: ${websocketQueue.length}`);
    isQueueProcessing = true;
    let queueItem = websocketQueue.shift();
    consoleLogger(`QueueItem Processing: ${queueItem.action}`);
    if (queueItem.action === 'PLAY_RESPONSE') {
      audioPlay(queueItem.value, 'RESPONSE');
    } else if (queueItem.action === 'PLAY_FEEDBACK') {
      audioPlay(queueItem.value, 'FEEDBACK');
    } else if (queueItem.action === 'PLAY_RINGTONE') {
      document.getElementById('speakButton').disabled = false;
      document.getElementById('inputText').disabled = false;
      audioPlay(queueItem.value, 'RINGTONE');
    } else if (
      queueItem.action === 'DISPLAY_RESPONSE' &&
      queueItem.type === 'IMAGE'
    ) {
      displayText(null, 'RESPONSE', queueItem.value);
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'DISPLAY_RESPONSE') {
      displayText(queueItem.value, 'RESPONSE');
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'DISPLAY_FEEDBACK') {
      displayText(queueItem.value, 'FEEDBACK');
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'REASONING') {
      reasoningLogger(`REASONING: ${queueItem.value}`);
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'TRANSCRIBE_CONNECTION') {
      websocketTranscribeUrl = queueItem.value;
      if (allowAudioInput) {
        startStreamAudio();
      }
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'FEEDBACK_END') {
      if (allowAudioInput) {
        document.getElementById('startProcessButton').style.display = 'inline';
        document.getElementById('stopProcessButton').style.display = 'none';
        document.getElementById('speakButton').disabled = false;
      }
      document.getElementById('inputText').disabled = false;
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'WAIT') {
      updateStatus('Processing', 'success', 'arrow-down-up');
      displayText(queueItem.value, queueItem.type);
      queueProcessorCompletedAction();
    } else if (queueItem.action === 'ERROR') {
      updateStatus('Processing', 'success', 'exclamation-square');
      displayText(queueItem.value, queueItem.type);
      queueProcessorCompletedAction();
    } else {
      queueProcessorCompletedAction();
    }
  }
  if (websocketQueue.length === 0) {
    updateStatus('Ready', 'success', 'check-square');
  }
}

/**
 * Processes items in the application websocket queue
 * @param {Object} data - Queue item to process
 */
function websocketApplicationQueueProcessor(data) {
  if (data) {
    websocketApplicationQueue.push(data);
  }
  if (
    websocketApplicationQueue.length &&
    websocketApplication &&
    websocketApplication.readyState === 1
  ) {
    while (websocketApplicationQueue.length > 0) {
      let message = websocketApplicationQueue.shift();
      websocketApplication.send(JSON.stringify(message));
    }
  }
}

/**
 * Establishes websocket connection with application server
 */
function websocketApplicationConnect() {
  websocketApplicationQueueProcessor(null);

  fetch(pathWebsocketApplicationUrl)
    .then((response) => response.json())
    .then((data) => {
      websocketApplicationUrl = data.websocket_url;
      consoleLogger('Updated Application Websocket URL');
      websocketApplication = new WebSocket(websocketApplicationUrl);

      websocketApplication.addEventListener('open', () => {
        consoleLogger('Application Websocket: CONNECTED');
        websocketApplicationQueueProcessor({
          action: 'startProcess',
          controls: JSON.stringify(localStorage),
        });
      });

      websocketApplication.addEventListener('message', (event) => {
        let data = JSON.parse(event.data);
        consoleLogger(`QueueItem Added: ${data.action}`);
        if (data.action === 'FEEDBACK_END') {
          websocketApplicationDisconnect();
        } else if (data.action === 'PROVIDE_FEEDBACK') {
          updateStatus('Generating Feedback', 'success', 'megaphone');
        }
        queueProcessor(data);
      });

      websocketApplication.addEventListener('close', () => {
        consoleLogger('Application Websocket: CLOSED');
        websocketApplicationQueueProcessor(null);
      });

      websocketApplication.addEventListener('error', (error) => {
        consoleLogger(
          `Application Websocket: ERROR (${JSON.stringify(error)})`
        );
        websocketApplicationConnect();
      });
    })
    .catch((error) => {
      console.error('Error Fetching Application Websocket URL:', error);
      showErrorMessage(
        'Websocket Error',
        'An error has occurred with the application websocket.\n Please reload your browser.'
      );
    });
}

/**
 * Closes the application websocket connection and clears the queue
 */
function websocketApplicationDisconnect() {
  websocketApplicationQueue.length = 0;
  websocketApplication.close();
}

setInterval(function () {
  if (!websocketApplication) {
    websocketApplicationConnect();
  } else {
    let message = {
      action: 'ping',
    };
    consoleLogger('Sending: PING');
    websocketApplicationQueueProcessor(message);
  }
}, 60000);

/**
 * Starts audio streaming by requesting microphone access and connecting to transcribe websocket
 * Uses getUserMedia API to get audio stream which is then passed to websocketTranscribeConnect
 */
function startStreamAudio() {
  window.navigator.mediaDevices
    .getUserMedia({
      video: false,
      audio: true,
    })
    .then(websocketTranscribeConnect)
    .catch((error) => {
      consoleLogger('Error Streaming to Amazon Transcribe:', error);
    });
}

/**
 * Sends user utterance to application websocket for processing
 * @param {string} utterance - The text utterance to send
 */
function sendUtterance(utterance) {
  let message = {
    action: 'sendUtterance',
    utterance: utterance,
  };
  updateStatus('Processing', 'success', 'arrow-down-up');
  websocketApplicationQueueProcessor(message);
  utterance = '';
  transcription = '';
}

/**
 * Handles incoming transcription messages from the websocket stream
 * @param {Object} messageJson - JSON message containing transcription results
 */
let handleEventStreamMessage = function (messageJson) {
  let results = messageJson.Transcript.Results;
  if (results.length > 0) {
    if (results[0].Alternatives.length > 0) {
      utteranceLastEvent = Date.now();
      consoleLogger(`utteranceLastEvent: ${utteranceLastEvent}`);
      let transcript = results[0].Alternatives[0].Transcript;
      transcript = decodeURIComponent(transcript);
      if (!results[0].IsPartial) {
        transcription += transcript + '\n';
        consoleLogger(`Transcript Completed: ${transcript}`);
        utterance += transcription;
        transcription = '';
      }
    }
  } else if (!isListening) {
    if (utterance.trim().split(/\W+/).length > 2) {
      // ISO-8859-1 to UTF-8
      try {
        utterance = decodeURIComponent(escape(utterance));
      } catch {
        // nothing
      }
      consoleLogger(`Captured utterance: ${utterance}`);
      inputText.value += ` ${utterance}`;
      document.getElementById('sendButton').disabled = false;
      if (allowAudioInputOnly) {
        document.getElementById('sendButton').click();
      }
      utterance = '';
      transcription = '';
    }
  }
};

/**
 * Establishes websocket connection for audio transcription
 * Sets up event listeners for the websocket and handles audio streaming
 * @param {MediaStream} userMediaStream - Media stream from getUserMedia
 */
let websocketTranscribeConnect = function (userMediaStream) {
  micStream = new mic();
  micStream.on('format', function (data) {
    micSampleRate = data.sampleRate;
  });
  micStream.setStream(userMediaStream);
  websocketTranscribe = new WebSocket(websocketTranscribeUrl);
  websocketTranscribe.binaryType = 'arraybuffer';

  websocketTranscribe.addEventListener('open', () => {
    consoleLogger('Transcribe Websocket: CONNECTED');
    websocketApplicationQueueProcessor(null);
    queueProcessor({ action: 'PLAY_RINGTONE', value: pathRingToneUrl });
    micStream.on('data', function (rawAudioChunk) {
      // the audio stream is raw audio bytes
      // transcribe expects PCM with additional metadata, encoded as binary
      let binary = convertAudioToBinaryMessage(rawAudioChunk);
      if (
        websocketTranscribe.readyState === websocketTranscribe.OPEN &&
        !isSpeaking &&
        isListening
      ) {
        updateStatus('Listening', 'success', 'mic');
        websocketTranscribe.send(binary);
      } else {
        // empty audio to keep the transcribe socket open
        let empty = new Uint8Array(16384);
        let emptyBinary = convertAudioToBinaryMessage(empty);
        websocketTranscribe.send(emptyBinary);
      }
    });
  });

  websocketTranscribe.addEventListener('message', (event) => {
    let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(event.data));
    let messageBody = JSON.parse(
      String.fromCharCode.apply(String, messageWrapper.body)
    );
    if (messageWrapper.headers[':message-type'].value === 'event') {
      handleEventStreamMessage(messageBody);
    }
  });

  websocketTranscribe.addEventListener('error', () => {
    consoleLogger('Transcribe Websocket: ERROR');
    showErrorMessage(
      'Websocket Error',
      'An error has occurred with the application websocket.\n Please reload your browser.'
    );
    websocketTranscribeConnect;
  });

  websocketTranscribe.addEventListener('close', (closeEvent) => {
    micStream.stop();
    if (closeEvent.code != 1000) {
      consoleLogger(`Streaming Exception: ${closeEvent.reason}`);
      showErrorMessage(
        'Websocket Error',
        'An error has occurred with the application websocket.\n Please reload your browser.'
      );
      websocketTranscribeConnect;
    } else {
      consoleLogger('Transcribe Websocket: CLOSED');
    }
  });
};

/**
 * Closes the transcribe websocket connection
 * Stops the microphone stream and sends an empty frame to initiate closure
 */
function websocketTranscribeDisconnect() {
  if (websocketTranscribe.readyState === websocketTranscribe.OPEN) {
    micStream.stop();
    // send an empty frame so that Transcribe initiates a closure
    // of the WebSocket after submitting all transcripts
    let emptyMessage = getAudioEventMessage(Buffer.from(new Buffer([])));
    let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
    websocketTranscribe.send(emptyBuffer);
  }
}

document.getElementById('startProcessButton').addEventListener('click', () => {
  clearAudio();
  websocketQueue.length = 0;
  websocketApplicationQueue.length = 0;
  audioDiv.play(); // this is a hack for Safari to initate audio unmute
  websocketApplicationConnect();
  if (allowAudioInput) {
    document.getElementById('startProcessButton').style.display = 'none';
    document.getElementById('stopProcessButton').style.display = 'inline';
    document.getElementById('speakButton').disabled = true;
  }
  document.getElementById('inputText').value = '';
  document.getElementById('inputText').disabled = false;
  document.getElementById('sendButton').disabled = true;
  document.getElementById('messages').innerHTML = '';
  updateStatus('Starting', 'success', 'arrow-repeat');
});

document.getElementById('stopProcessButton').addEventListener('click', () => {
  websocketTranscribeDisconnect();
  websocketApplicationQueueProcessor({ action: 'stopProcess' });
  websocketApplicationDisconnect();
  if (allowAudioInput) {
    document.getElementById('startProcessButton').style.display = 'inline';
    document.getElementById('stopProcessButton').style.display = 'none';
    document.getElementById('speakButton').disabled = true;
  }
  document.getElementById('inputText').disabled = false;
  document.getElementById('sendButton').disabled = true;
  updateStatus('Stopped', 'success', 'slash-square');
});

/**
 * Starts the listening process for audio input
 * Clears audio, resets queues, and updates UI elements to listening state
 * Disables text input and enables appropriate audio controls
 */
function whileListeningStart() {
  clearAudio();
  websocketQueue.length = 0;
  websocketApplicationQueue.length = 0;
  audioDiv.play(); // this is a hack for Safari to initiate audio unmute
  isSpeaking = false;
  isListening = true;
  if (allowAudioInput) {
    document.getElementById('startProcessButton').style.display = 'none';
    document.getElementById('stopProcessButton').style.display = 'inline';
    document.getElementById('stopProcessButton').disabled = true;
    document.getElementById('speakButton').disabled = false;
  }
  document.getElementById('inputText').disabled = true;
  document.getElementById('sendButton').disabled = true;
  updateStatus('Listening', 'success', 'mic');
}

/**
 * Stops the listening process for audio input
 * Updates UI elements back to ready state and re-enables text input
 */
function whileListeningStop() {
  isListening = false;
  if (allowAudioInput) {
    document.getElementById('startProcessButton').style.display = 'none';
    document.getElementById('stopProcessButton').style.display = 'inline';
    document.getElementById('stopProcessButton').disabled = false;
    document.getElementById('speakButton').disabled = false;
  }
  document.getElementById('inputText').disabled = false;
  updateStatus('Ready', 'success', 'check-square');
}

document.getElementById('speakButton').addEventListener('mousedown', () => {
  consoleLogger('speakButton mousedown');
  whileListeningStart();
});

document.getElementById('speakButton').addEventListener('mouseup', () => {
  consoleLogger('speakButton mouseup');
  whileListeningStop();
});

window.addEventListener('keydown', (event) => {
  if (
    (event.key === ' ' || event.key === 'Spacebar') &&
    !isListeningKeyDown &&
    allowAudioInputOnly
  ) {
    event.preventDefault();
    isListeningKeyDown = true;
    consoleLogger('Spacebar pressed');
    document.getElementById('mic-background').style.display = 'inline';
    document.getElementById('mic-layer').style.display = 'inline';
    whileListeningStart();
  }
});

window.addEventListener('keyup', (event) => {
  if (
    (event.key === ' ' || event.key === 'Spacebar') &&
    isListeningKeyDown &&
    allowAudioInputOnly
  ) {
    isListeningKeyDown = false;
    consoleLogger('Spacebar released');
    document.getElementById('mic-background').style.display = 'none';
    document.getElementById('mic-layer').style.display = 'none';
    whileListeningStop();
  }
});

document.getElementById('sendButton').addEventListener('click', () => {
  if (document.getElementById('inputText').value.length > 0) {
    // clearAudio();
    websocketQueue.length = 0;
    websocketApplicationQueue.length = 0;
    audioDiv.play(); // this is a hack for Safari to initiate audio unmute
    consoleLogger('sendButton clicked');

    if (!websocketApplication) {
      websocketApplicationConnect();
    }

    isListening = false;

    var splash = document.getElementById('splash');
    if (splash) {
      document.getElementById('messages').innerHTML = '';
    }

    if (allowAudioInput) {
      document.getElementById('startProcessButton').style.display = 'none';
      document.getElementById('stopProcessButton').style.display = 'inline';
      document.getElementById('stopProcessButton').disabled = false;
      document.getElementById('speakButton').disabled = false;
    }

    document.getElementById('inputText').disabled = false;
    sendUtterance(document.getElementById('inputText').value);
    displayText(document.getElementById('inputText').value, 'UTTERANCE');
    displayText('BUILDING_RESPONSE', 'WAIT');
    document.getElementById('inputText').value = '';
    document.getElementById('sendButton').disabled = true;
  }
});

document.getElementById('inputText').addEventListener('input', () => {
  if (document.getElementById('inputText').value.length > 0) {
    document.getElementById('sendButton').disabled = false;
  } else {
    document.getElementById('sendButton').disabled = true;
  }
});

document.getElementById('inputText').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === 13) {
    event.preventDefault();
    document.getElementById('sendButton').click();
  }
});

/**
 * Converts raw audio chunk to binary message format for transcription
 * @param {Uint8Array} audioChunk - Raw audio data chunk
 * @returns {ArrayBuffer} Binary message formatted for transcription service
 */
function convertAudioToBinaryMessage(audioChunk) {
  let raw = mic.toRaw(audioChunk);
  if (raw == null) return;
  let downsampledBuffer = downsampleBuffer(
    raw,
    micSampleRate,
    transcribeSampleRate
  );
  let pcmEncodedBuffer = pcmEncode(downsampledBuffer);
  let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));
  let binary = eventStreamMarshaller.marshall(audioEventMessage);
  return binary;
}

/**
 * Creates audio event message object with headers and buffer body
 * @param {Buffer} buffer - Audio data buffer
 * @returns {Object} Audio event message object
 */
function getAudioEventMessage(buffer) {
  return {
    headers: {
      ':message-type': {
        type: 'string',
        value: 'event',
      },
      ':event-type': {
        type: 'string',
        value: 'AudioEvent',
      },
    },
    body: buffer,
  };
}

/**
 * Updates the status display with message and icon
 * @param {string} status - Status message to display
 * @param {string} type - Type of status (success, error, etc)
 * @param {string} icon - Bootstrap icon name to display
 */
function updateStatus(status, type, icon) {
  statusDiv.className = `btn btn-outline-${type}`;
  statusDiv.innerHTML = `<i class='bi bi-${icon}'></i> ${status}`;
}

/**
 * Encodes audio buffer to PCM format
 * @param {Float32Array} input - Input audio buffer
 * @returns {ArrayBuffer} PCM encoded audio buffer
 */
function pcmEncode(input) {
  var offset = 0;
  var buffer = new ArrayBuffer(input.length * 2);
  var view = new DataView(buffer);
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/**
 * Downsamples audio buffer to target sample rate
 * @param {Float32Array} buffer - Input audio buffer
 * @param {number} inputSampleRate - Original sample rate of buffer
 * @param {number} outputSampleRate - Target sample rate
 * @returns {Float32Array} Downsampled audio buffer
 */
function downsampleBuffer(
  buffer,
  inputSampleRate = 44100,
  outputSampleRate = 16000
) {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }

  var sampleRateRatio = inputSampleRate / outputSampleRate;
  var newLength = Math.round(buffer.length / sampleRateRatio);
  var result = new Float32Array(newLength);
  var offsetResult = 0;
  var offsetBuffer = 0;

  while (offsetResult < result.length) {
    var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);

    var accum = 0,
      count = 0;

    for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Sets a value in localStorage
 * @param {string} key - Key to store value under
 * @param {*} value - Value to store
 */
function setLocalStorageValue(key, value) {
  if (window.localStorage) {
    localStorage.setItem(key, value);
  }
}

/**
 * Gets a value from localStorage, setting default if not found
 * @param {string} key - Key to retrieve value for
 * @returns {*} Value from localStorage or default value
 */
function getLocalStorageValue(key) {
  if (window.localStorage) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      return value;
    } else {
      setLocalStorageValue(key, getDefaultValue(key));
      return getDefaultValue(key);
    }
  }
  return getDefaultValue(key);
}

/**
 * Gets default value for a control key
 * @param {string} key - Control key to get default value for
 * @returns {*} Default value for the control
 */
function getDefaultValue(key) {
  return controlValues[key]['DEFAULT'];
}

const controlItems = [
  'audioPlaybackSpeed',
  'scenarioSelection',
  'languageCode',
];
const controlValues = {
  audioPlaybackSpeed: {
    DEFAULT: 4,
    1: 'x-slow',
    2: 'slow',
    3: 'medium',
    4: 'fast',
    5: 'x-fast',
  },
  scenarioSelection: __SCENARIO_OPTIONS__,
  languageCode: {
    DEFAULT: 'en-US',
    'en-US': 'English',
    'es-US': 'Spanish',
    'fr-FR': 'French',
    'de-DE': 'German',
  },
};

/**
 * Updates the display value for a control element in the UI
 * Gets the current value from localStorage and updates the corresponding display element
 * @param {string} element - The control element ID to update the display for
 */
function updateControlDisplayValue(element) {
  consoleLogger(`Updating Control Value Display: ${element}`);
  let value = getLocalStorageValue(element);
  document.getElementById(`${element}Display`).innerHTML =
    controlValues[element][value].toUpperCase();
}

document.getElementById('openControlPanel').addEventListener('click', () => {
  for (let element in controlItems) {
    updateControlDisplayValue(controlItems[element]);
  }
});

for (let element in controlItems) {
  consoleLogger(`Adding Control Listener: ${controlItems[element]}`);
  document.getElementById(controlItems[element]).value = getLocalStorageValue(
    controlItems[element]
  );
  document
    .getElementById(controlItems[element])
    .addEventListener('change', (event) => {
      setLocalStorageValue(controlItems[element], event.target.value);
      updateControlDisplayValue(controlItems[element]);
    });
}

/**
 * Clears and resets the audio player
 * Sets source to empty tone, removes URL attribute and pauses playback
 */
function clearAudio() {
  audioDiv.src = pathEmptyToneUrl;
  audioDiv.removeAttribute('url');
  audioDiv.pause();
}

/**
 * Shows an error modal dialog with the given title and message
 * @param {string} title - The title to display in the error modal
 * @param {string} message - The error message to display in the modal body
 */
function showErrorMessage(title, message) {
  document.getElementById('error-modal-title-center').innerText = title;
  document.getElementById('error-modal-body').innerText = message;
  $('#error-modal').modal('show');
}
