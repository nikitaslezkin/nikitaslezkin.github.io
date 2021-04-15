const name = prompt("What's your name?");
const configuration = {iceServers: [{url: 'stun:stun.l.google.com:19302'}]};
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
const roomName = 'observable-' + name;
let room;
let pc;
let dataChannel;

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      return console.error(error);
    }
  });
  room.on('members', members => {
    if (members.length === 1) {
      return alert('This user is not expected');
    }
    if (members.length >= 3) {
      return alert('The room is full');
    }
    startWebRTC();
  });
});

function sendSignalingMessage(message) {
  drone.publish({room: roomName, message});
}

function startWebRTC() {
  pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate});
    }
  };

  pc.onnegotiationneeded = () => {
    pc.createOffer(localDescCreated, error => console.error(error));
  }
  dataChannel = pc.createDataChannel('chat');
  setupDataChannel();
  startListeningToSignals();
}

function startListeningToSignals() {
  room.on('data', (message, client) => {
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer(localDescCreated, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
      desc,
      () => sendSignalingMessage({'sdp': pc.localDescription}),
      error => console.error(error)
  );
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2);
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function setupDataChannel() {
  checkDataChannelState();
  dataChannel.onopen = checkDataChannelState;
  dataChannel.onclose = checkDataChannelState;
  dataChannel.onmessage = async event => {
    let answer = JSON.parse(event.data)
    let data = answer.content
    const arrayBuffer = str2ab(answer.code);
    const res = await WebAssembly.instantiate(arrayBuffer, {})
    const {_Z3sumPii, memory} = res.instance.exports
    const array = new Int32Array(memory.buffer, 0, data.length)
    array.set(data)
    const result = _Z3sumPii(array.byteOffset, array.length)
    const new_data = {name, content: result};
    dataChannel.send(JSON.stringify(new_data));

    insertMessageToDOM({content: `f([${array.join(',')}]) = ${result}`}, true)
  }
}

function checkDataChannelState() {
  if (dataChannel.readyState === 'open') {
    insertMessageToDOM({content: 'Peer ' + name + ' connected'});
  }
}

function insertMessageToDOM(options, isFromMe) {
  const template = document.querySelector('template[data-template="message"]');
  const nameEl = template.content.querySelector('.message__name');
  if (options.name) {
    nameEl.innerText = options.name;
  }
  template.content.querySelector('.message__bubble').innerText = options.content;
  const clone = document.importNode(template.content, true);
  const messageEl = clone.querySelector('.message');
  if (isFromMe) {
    messageEl.classList.add('message--mine');
  } else {
    messageEl.classList.add('message--theirs');
  }

  const messagesEl = document.querySelector('.messages');
  messagesEl.appendChild(clone);
  messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}
