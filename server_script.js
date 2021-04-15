const name = 'server';
const configuration = {iceServers: [{url: 'stun:stun.l.google.com:19302'}]};
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');
let room = {};
let pc = {};
let dataChannel = {};
let peerCount = 0
let wasmcode
let peerAnswerCount = 0
let listAnswer = []

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
});

function sendSignalingMessage(message, value) {
  drone.publish({room: 'observable-' + value, message});
}

function startWebRTC(value) {
  pc[value] = new RTCPeerConnection(configuration);
  pc[value].onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate}, value);
    }
  };

  pc[value].ondatachannel = event => {
    dataChannel[value] = event.channel;
    setupDataChannel(value);
  }
  startListeningToSignals(value);
}

function startListeningToSignals(value) {
  room[value].on('data', (message, client) => {
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      pc[value].setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        if (pc[value].remoteDescription.type === 'offer') {
          pc[value].createAnswer( desc => pc[value].setLocalDescription(
              desc,
              () => sendSignalingMessage({'sdp': pc[value].localDescription}, value),
              error => console.error(error)
          ), error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      pc[value].addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function setupDataChannel(value) {
  let fun = checkDataChannelState(value);
  dataChannel[value].onopen = fun;
  dataChannel[value].onclose = fun;
  dataChannel[value].onmessage = async event => {
    let parse = JSON.parse(event.data)
    insertMessageToDOM(parse, false)
    peerAnswerCount = peerAnswerCount + 1
    listAnswer.push(parse.content)
    if (peerAnswerCount === peerCount) {
      listAnswer = listAnswer.map(x => +x)
      const res = await WebAssembly.instantiate(wasmcode, {})
      const {_Z3sumPii, memory} = res.instance.exports
      const array = new Int32Array(memory.buffer, 0, listAnswer.length)
      array.set(listAnswer)
      const result = _Z3sumPii(array.byteOffset, array.length)

      insertMessageToDOM({content: `result = ${result}`}, true)
    }
  }
}

function checkDataChannelState(value) {
  if (dataChannel[value].readyState === 'open') {
    insertMessageToDOM({content: 'Peer ' + value + ' connected'});
    peerCount = peerCount + 1
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

function createRoom(value) {
  room[value] = drone.subscribe('observable-' + value);
  room[value].on('open', error => {
    if (error) {
      return console.error(error);
    }
  });

  room[value].on('members', members => {
    console.log(members)
    if (members.length >= 3) {
      return alert('The room is full');
    }
    startWebRTC(value);
  });
}


const form = document.querySelector('form');
form.addEventListener('submit', () => {
  const input = document.querySelector('input[type="text"]');
  const value = input.value;
  input.value = '';
  let arr = value.split(' ').map(x=>+x)
  let count = (arr.length - arr.length%peerCount)/peerCount
  let fcount = count + arr.length%peerCount

  peerAnswerCount = 0
  listAnswer = []
  let iter = 0
  let strwasmcode = ab2str(wasmcode)
  for(const key in dataChannel) {
    let left = iter === 0 ? 0 : fcount+count*(iter-1)
    let right = iter === 0 ? fcount : fcount+count*iter
    let data = {name, content: arr.slice(left, right), code:strwasmcode};
    iter = iter + 1
    dataChannel[key].send(JSON.stringify(data));
  }
  let data = {name, content: value};
  insertMessageToDOM(data, true);

});

document.getElementById("create").addEventListener("click", function() {
  const input = document.getElementById("new_peer")
  const value = input.value;
  input.value = '';
  createRoom(value)
  insertMessageToDOM({content: 'Access for peer ' + value + ' allowed'});
});

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

document.getElementById("open").addEventListener("click", function() {
  const input = document.getElementById('file-input');
  const wasm_name = document.getElementById('wasm_name');
  input.click();

  input.onchange = e => {
    const file = e.target.files[0];
    wasm_name.value = file.name
    const reader = new FileReader();
    reader.readAsArrayBuffer(file)
    reader.onload = async function () {
      wasmcode = reader.result
    };
  }
});
