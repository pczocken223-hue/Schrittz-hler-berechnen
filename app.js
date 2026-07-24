// --- Sicherheitskontext prüfen: Mikrofon geht nur über https:// oder localhost ---
if(!window.isSecureContext){
  document.getElementById('insecureBanner').classList.remove('hidden');
}

const LANGS = [
  {name:'Deutsch', recog:'de-DE', mm:'de'},
  {name:'Englisch', recog:'en-US', mm:'en'},
  {name:'Spanisch', recog:'es-ES', mm:'es'},
  {name:'Französisch', recog:'fr-FR', mm:'fr'},
  {name:'Italienisch', recog:'it-IT', mm:'it'},
  {name:'Portugiesisch', recog:'pt-PT', mm:'pt'},
  {name:'Niederländisch', recog:'nl-NL', mm:'nl'},
  {name:'Polnisch', recog:'pl-PL', mm:'pl'},
  {name:'Russisch', recog:'ru-RU', mm:'ru'},
  {name:'Türkisch', recog:'tr-TR', mm:'tr'},
  {name:'Arabisch', recog:'ar-SA', mm:'ar'},
  {name:'Chinesisch (Mandarin)', recog:'zh-CN', mm:'zh'},
  {name:'Japanisch', recog:'ja-JP', mm:'ja'},
  {name:'Koreanisch', recog:'ko-KR', mm:'ko'},
  {name:'Hindi', recog:'hi-IN', mm:'hi'},
  {name:'Schwedisch', recog:'sv-SE', mm:'sv'},
  {name:'Griechisch', recog:'el-GR', mm:'el'},
];

const els = {
  langA: document.getElementById('langA'),
  langB: document.getElementById('langB'),
  swapBtn: document.getElementById('swapBtn'),
  autoSpeak: document.getElementById('autoSpeak'),
  micA: document.getElementById('micA'),
  micB: document.getElementById('micB'),
  micALabel: document.getElementById('micALabel'),
  micBLabel: document.getElementById('micBLabel'),
  status: document.getElementById('status'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  feed: document.getElementById('feed'),
  feedEmpty: document.getElementById('feedEmpty'),
};

LANGS.forEach((l, i) => {
  const oa = document.createElement('option'); oa.value = i; oa.textContent = l.name;
  els.langA.appendChild(oa);
  const ob = document.createElement('option'); ob.value = i; ob.textContent = l.name;
  els.langB.appendChild(ob);
});
els.langA.value = 0; // Deutsch
els.langB.value = 1; // Englisch
updateMicLabels();

function updateMicLabels(){
  els.micALabel.textContent = 'Person A · ' + LANGS[els.langA.value].name;
  els.micBLabel.textContent = 'Person B · ' + LANGS[els.langB.value].name;
}
els.langA.addEventListener('change', updateMicLabels);
els.langB.addEventListener('change', updateMicLabels);

els.swapBtn.addEventListener('click', () => {
  const tmp = els.langA.value;
  els.langA.value = els.langB.value;
  els.langB.value = tmp;
  updateMicLabels();
});

function setStatus(msg, state){
  // state: 'idle' | 'listening' | 'translating' | 'err'
  els.statusText.textContent = msg;
  els.status.classList.remove('listening', 'translating', 'err');
  if(state && state !== 'idle') els.status.classList.add(state);
}

let interimBubble = null;

function addBubble(side, origText, translatedText, interim){
  if(els.feedEmpty) els.feedEmpty.classList.add('hidden');
  const row = document.createElement('div');
  row.className = 'bubble-row ' + side + (interim ? ' interim' : '');
  row.innerHTML = `
    <div class="avatar ${side}">${side.toUpperCase()}</div>
    <div class="bubble">
      <div class="orig">${escapeHtml(origText)}</div>
      ${translatedText !== undefined ? `<div class="arrow">↓ übersetzt</div><div class="translated">${escapeHtml(translatedText)}</div>` : ''}
    </div>
  `;
  els.feed.appendChild(row);
  window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});
  return row;
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Übersetzung (MyMemory, kostenlos, kein Schlüssel) ---
async function translateText(text, sourceMM, targetMM){
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceMM}|${targetMM}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Übersetzungsdienst nicht erreichbar');
  const data = await res.json();
  if(!data.responseData || !data.responseData.translatedText) throw new Error('Keine Übersetzung erhalten');
  return data.responseData.translatedText;
}

// --- Sprachausgabe ---
let voicesCache = [];
function loadVoices(){ voicesCache = speechSynthesis.getVoices(); }
loadVoices();
if('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;

function speak(text, recogLangCode){
  if(!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  const match = voicesCache.find(v => v.lang === recogLangCode) ||
                voicesCache.find(v => v.lang.startsWith(recogLangCode.split('-')[0]));
  if(match) utter.voice = match;
  utter.lang = recogLangCode;
  utter.onstart = () => setStatus('Spreche Übersetzung …', 'translating');
  utter.onend = () => setStatus('Bereit — Mikrofon der sprechenden Person antippen');
  speechSynthesis.speak(utter);
}

// --- Spracherkennung: EIN Motor, wird je nach aktivem Sprecher umkonfiguriert ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;
let activeSide = null; // 'a' oder 'b'

function explainMicError(err){
  const name = err && err.name;
  if(!window.isSecureContext) return 'Mikrofon blockiert: Seite läuft über file:// — siehe Hinweis oben.';
  if(name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Mikrofonzugriff wurde verweigert. Bitte in den Browser-Einstellungen für diese Seite erlauben und neu laden.';
  if(name === 'NotFoundError') return 'Kein Mikrofon gefunden.';
  if(name === 'NotReadableError') return 'Mikrofon wird bereits von einem anderen Programm benutzt.';
  return 'Mikrofonzugriff fehlgeschlagen (' + (name || err) + ').';
}

if(!SpeechRecognition){
  setStatus('Spracherkennung wird von diesem Browser nicht unterstützt — bitte Chrome oder Edge verwenden.', 'err');
  els.micA.disabled = true;
  els.micB.disabled = true;
} else {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interimText = '';
    for(let i = event.resultIndex; i < event.results.length; i++){
      const result = event.results[i];
      if(result.isFinal){
        const finalText = result[0].transcript.trim();
        if(interimBubble){ interimBubble.remove(); interimBubble = null; }
        if(finalText) handleUtterance(finalText);
      } else {
        interimText += result[0].transcript;
      }
    }
    if(interimText && activeSide){
      if(!interimBubble) interimBubble = addBubble(activeSide, '', undefined, true);
      interimBubble.querySelector('.orig').textContent = interimText;
    }
  };

  recognition.onerror = (event) => {
    const map = {
      'not-allowed': 'Mikrofonzugriff wurde verweigert oder blockiert.',
      'service-not-allowed': 'Spracherkennungsdienst wurde vom Browser blockiert (oft bei file:// oder fehlendem Internet).',
      'audio-capture': 'Kein Mikrofon gefunden.',
      'network': 'Keine Verbindung zum Spracherkennungsdienst — Internet prüfen.',
      'no-speech': 'Keine Sprache erkannt — bitte erneut versuchen.',
    };
    setStatus(map[event.error] || ('Fehler bei der Spracherkennung: ' + event.error), 'err');
    if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){
      stopRecording();
    }
  };

  recognition.onend = () => {
    if(isRecording) recognition.start(); // am Laufen halten, solange Aufnahme aktiv ist
  };
}

async function handleUtterance(text){
  const src = activeSide === 'a' ? LANGS[els.langA.value] : LANGS[els.langB.value];
  const tgt = activeSide === 'a' ? LANGS[els.langB.value] : LANGS[els.langA.value];
  addBubble(activeSide, text, '…');
  const lastBubble = els.feed.lastElementChild;
  setStatus('Übersetze …', 'translating');
  try{
    const translated = await translateText(text, src.mm, tgt.mm);
    lastBubble.querySelector('.translated').textContent = translated;
    if(els.autoSpeak.checked){
      speak(translated, tgt.recog);
    } else {
      setStatus('Bereit — Mikrofon der sprechenden Person antippen');
    }
  } catch(e){
    lastBubble.querySelector('.translated').textContent = '[Übersetzung fehlgeschlagen]';
    setStatus('Übersetzung fehlgeschlagen: ' + e.message, 'err');
  }
}

function stopRecording(){
  isRecording = false;
  activeSide = null;
  if(recognition) recognition.stop();
  els.micA.classList.remove('recording');
  els.micB.classList.remove('recording');
  setStatus('Bereit — Mikrofon der sprechenden Person antippen');
}

async function startRecording(side){
  if(!recognition) return;

  if(isRecording && activeSide === side){
    stopRecording();
    return;
  }

  if(!window.isSecureContext){
    document.getElementById('insecureBanner').classList.remove('hidden');
    setStatus('Mikrofon blockiert — siehe Hinweis oben.', 'err');
    return;
  }

  try{
    setStatus('Frage Mikrofonberechtigung an …');
    const testStream = await navigator.mediaDevices.getUserMedia({audio:true});
    testStream.getTracks().forEach(t => t.stop());
  } catch(err){
    setStatus(explainMicError(err), 'err');
    return;
  }

  if(isRecording) recognition.stop(); // laufende Aufnahme der anderen Person beenden

  activeSide = side;
  const lang = side === 'a' ? LANGS[els.langA.value] : LANGS[els.langB.value];
  try{
    recognition.lang = lang.recog;
    recognition.start();
    isRecording = true;
    els.micA.classList.toggle('recording', side === 'a');
    els.micB.classList.toggle('recording', side === 'b');
    setStatus((side === 'a' ? 'Person A' : 'Person B') + ' spricht — höre zu …', 'listening');
  } catch(err){
    setStatus('Spracherkennung konnte nicht starten (' + err.message + ')', 'err');
  }
}

els.micA.addEventListener('click', () => startRecording('a'));
els.micB.addEventListener('click', () => startRecording('b'));

// --- PWA: Service Worker registrieren (App-Hülle offline verfügbar) ---
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
