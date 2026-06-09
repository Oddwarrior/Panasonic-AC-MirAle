import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Mic, MicOff, X, Volume2, VolumeX, User, Calendar, Power, Thermometer, ChevronDown, Check, RefreshCw, ChevronLeft, MessageSquare } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isSpeechSupported = !!SpeechRecognition;

const QUICK_PROMPTS = [
  "Turn off after 15 mins",
  "Set temperature to 24 degrees",
  "Turn on the AC",
  "Cooling at 23 degrees",
  "Quiet fan mode please",
  "Turn off AC right now",
  "Set preset to eco"
];

const WaveformIcon = ({ className = "w-4 h-4" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <line x1="12" x2="12" y1="2" y2="22" />
    <line x1="17" x2="17" y1="5" y2="19" />
    <line x1="22" x2="22" y1="10" y2="14" />
    <line x1="7" x2="7" y1="5" y2="19" />
    <line x1="2" x2="2" y1="10" y2="14" />
  </svg>
);

export default function AiChatbot({ selectedDevice, token, sendControl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [messages, setMessages] = useState(() => {
    const saved = sessionStorage.getItem('ai_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved chat history", e);
      }
    }
    return [
      {
        id: 'welcome',
        sender: 'ai',
        text: 'Hello! I am your MirAIe AC Assistant. You can speak or type commands like "turn on the AC", "make it 23 degrees", or "turn off in 15 mins".',
        timestamp: new Date().toISOString()
      }
    ];
  });
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem('chatbot_voice_enabled');
    return saved !== 'false'; // Default to true
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [displayedVoiceReply, setDisplayedVoiceReply] = useState('Hello! I am your MirAIe AC Assistant. You can speak or type commands like "turn on the AC", "make it 23 degrees", or "turn off in 15 mins".');

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const replyAnimationRef = useRef(null);

  const startReplyAnimation = (fullText) => {
    if (replyAnimationRef.current) {
      clearInterval(replyAnimationRef.current);
    }
    setDisplayedVoiceReply('');
    const words = fullText.split(' ');
    let currentIdx = 0;
    let currentStr = '';

    replyAnimationRef.current = setInterval(() => {
      if (currentIdx < words.length) {
        currentStr += (currentIdx === 0 ? '' : ' ') + words[currentIdx];
        setDisplayedVoiceReply(currentStr);
        currentIdx++;
      } else {
        clearInterval(replyAnimationRef.current);
        replyAnimationRef.current = null;
      }
    }, 75);
  };

  // Cleanup typewriter animation on unmount
  useEffect(() => {
    return () => {
      if (replyAnimationRef.current) {
        clearInterval(replyAnimationRef.current);
      }
    };
  }, []);

  // Sync voice reply text to active states
  useEffect(() => {
    if (isRecording) {
      setDisplayedVoiceReply("Listening for your command...");
      if (replyAnimationRef.current) {
        clearInterval(replyAnimationRef.current);
        replyAnimationRef.current = null;
      }
    } else if (isGenerating) {
      setDisplayedVoiceReply("Processing command...");
      if (replyAnimationRef.current) {
        clearInterval(replyAnimationRef.current);
        replyAnimationRef.current = null;
      }
    } else if (errorMsg) {
      setDisplayedVoiceReply(`Error: ${errorMsg}`);
    }
  }, [isRecording, isGenerating, errorMsg]);

  // Sync chat history to session storage
  useEffect(() => {
    sessionStorage.setItem('ai_chat_history', JSON.stringify(messages));
  }, [messages]);

  // Persist voice preference
  useEffect(() => {
    localStorage.setItem('chatbot_voice_enabled', voiceEnabled.toString());
  }, [voiceEnabled]);

  // Scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (isOpen && !isVoiceMode) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages, isOpen, isVoiceMode]);

  // Handle speech recognition auto-start on panel open or voice mode switch
  useEffect(() => {
    if (isOpen && isVoiceMode) {
      if (isSpeechSupported && !isRecording) {
        const timer = setTimeout(() => {
          try {
            recognitionRef.current?.abort();
            recognitionRef.current?.start();
          } catch (e) {
            console.error("Auto-start voice capture failed:", e);
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    } else {
      // If closed or switched out of voice mode, stop recording
      if (isRecording) {
        recognitionRef.current?.stop();
      }
    }
  }, [isOpen, isVoiceMode]);

  // Setup speech recognition
  useEffect(() => {
    if (isSpeechSupported) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
        setSpeechTranscript('');
        setErrorMsg('');
      };

      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript.trim()) {
          setSpeechTranscript(finalTranscript);
          handleSendMessage(finalTranscript.trim());
          rec.stop(); // Stop capture on final transcription match
        } else {
          setSpeechTranscript(interimTranscript);
        }
      };

      rec.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone permission blocked.');
        } else {
          setErrorMsg('Could not capture voice. Try again.');
        }
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Text to speech (TTS) function
  const speakReply = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;

    // Stop any current speech immediately
    window.speechSynthesis.cancel();

    // Remove code formatting and special markers for natural speech
    const cleanText = text
      .replace(/\[[^\]]+\]/g, '') // remove details like [Power: ON]
      .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '') // remove emojis
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95; // Slightly slower for clear dictation
    utterance.pitch = 1.05; // Friendly pitch

    // Choose English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Zira')) &&
      v.lang.startsWith('en')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  };

  // Safe voices loading helper
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const toggleRecording = () => {
    if (!isSpeechSupported) {
      setErrorMsg("Voice recognition is not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setIsVoiceMode(true); // Always enter Voice UI when recording starts
      setSpeechTranscript('');
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Failed to start speech recognition", e);
        // Recreate and retry if instance is in bad state
        try {
          recognitionRef.current?.abort();
          recognitionRef.current?.start();
        } catch (err) {
          setErrorMsg("Failed to start recording. Please refresh.");
        }
      }
    }
  };

  const handleSendMessage = async (textToSubmit) => {
    const query = textToSubmit || inputValue;
    if (!query || !query.trim()) return;

    if (!selectedDevice) {
      setErrorMsg("Please select a device in the dashboard header first.");
      return;
    }

    const userMsg = {
      id: Math.random().toString(36).substring(7),
      sender: 'user',
      text: query,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsGenerating(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${API_BASE}/api/chatbot/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: query,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          deviceId: selectedDevice.id
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to get a response.');
      }

      const data = await response.json();
      
      const aiMsg = {
        id: Math.random().toString(36).substring(7),
        sender: 'ai',
        text: data.reply,
        timestamp: new Date().toISOString(),
        type: data.type,
        actions: data.actions,
        workflow: data.workflow
      };

      setMessages(prev => [...prev, aiMsg]);
      startReplyAnimation(data.reply);

      // Speak back the response
      speakReply(data.reply);

      // Perform Frontend Sync Actions
      if (data.type === 'control' && data.actions) {
        Object.entries(data.actions).forEach(([key, val]) => {
          if (val === undefined || val === null) return;
          if (key === 'power') {
            sendControl('power', val === 'on' || val === true);
          } else if (key === 'temperature' || key === 'vSwing' || key === 'hSwing' || key === 'converti') {
            sendControl(key, Number(val));
          } else {
            sendControl(key, val);
          }
        });
      }

      // If workflow was successfully created on the database, notify the workflows view to reload
      if (data.type === 'workflow' && data.workflow) {
        window.dispatchEvent(new CustomEvent('workflows-refresh'));
      }

    } catch (err) {
      console.error("Chatbot submission failed:", err);
      setErrorMsg(err.message || 'Chatbot request failed. Check server connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'ai',
        text: 'Hello! I am your MirAIe AC Assistant. You can speak or type commands like "turn on the AC", "make it 23 degrees", or "turn off in 15 mins".',
        timestamp: new Date().toISOString()
      }
    ]);
    setDisplayedVoiceReply('Hello! I am your MirAIe AC Assistant. You can speak or type commands like "turn on the AC", "make it 23 degrees", or "turn off in 15 mins".');
    setErrorMsg('');
  };

  return (
    <>
      {/* Waveform, Orbs & Fullscreen Keyframe Animations Injection */}
      <style>{`
        @keyframes wave-pulse-1 { 0%, 100% { height: 4px; } 50% { height: 20px; } }
        @keyframes wave-pulse-2 { 0%, 100% { height: 6px; } 50% { height: 28px; } }
        @keyframes wave-pulse-3 { 0%, 100% { height: 8px; } 50% { height: 24px; } }
        @keyframes wave-pulse-4 { 0%, 100% { height: 5px; } 50% { height: 22px; } }
        @keyframes wave-pulse-5 { 0%, 100% { height: 7px; } 50% { height: 26px; } }

        .animate-wave-1 { animation: wave-pulse-1 0.75s infinite ease-in-out; }
        .animate-wave-2 { animation: wave-pulse-2 1.1s infinite ease-in-out; }
        .animate-wave-3 { animation: wave-pulse-3 0.9s infinite ease-in-out; }
        .animate-wave-4 { animation: wave-pulse-4 1.25s infinite ease-in-out; }
        .animate-wave-5 { animation: wave-pulse-5 0.8s infinite ease-in-out; }

        @keyframes pulse-rings {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.4; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        .animate-pulse-rings {
          animation: pulse-rings 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }

        @keyframes orb-rotate-1 {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes orb-rotate-2 {
          0% { transform: rotate(120deg) scale(1.05); }
          50% { transform: rotate(-60deg) scale(0.95); }
          100% { transform: rotate(120deg) scale(1.05); }
        }
        @keyframes orb-rotate-3 {
          0% { transform: rotate(240deg) scale(0.98); }
          50% { transform: rotate(420deg) scale(1.06); }
          100% { transform: rotate(240deg) scale(0.98); }
        }

        .animate-orb-1 { animation: orb-rotate-1 6s infinite linear; }
        .animate-orb-2 { animation: orb-rotate-2 8s infinite ease-in-out; }
        .animate-orb-3 { animation: orb-rotate-3 7s infinite linear; }

        @keyframes panel-slide-mobile {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes panel-slide-desktop {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-panel-slide {
          animation: panel-slide-mobile 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (min-width: 640px) {
          .animate-panel-slide {
            animation: panel-slide-desktop 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
        }
      `}</style>

      {/* Floating Trigger Button */}
      <div className={`fixed bottom-6 right-6 z-[9999] flex items-center justify-center ${isOpen ? 'hidden sm:flex' : 'flex'}`}>
        {isRecording && (
          <div className="absolute w-16 h-16 bg-blue-500/20 rounded-full animate-pulse-rings pointer-events-none" />
        )}
        <button
          onClick={() => {
            const nextOpen = !isOpen;
            setIsOpen(nextOpen);
            if (nextOpen) {
              setIsVoiceMode(true);
            } else {
              if (isRecording) {
                recognitionRef.current?.stop();
              }
            }
          }}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 shadow-lg ${
            isOpen
              ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700'
              : 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white hover:scale-105 shadow-blue-500/25 border border-indigo-500/30'
          }`}
          title="Toggle Assistant"
        >
          {isOpen ? (
            <ChevronDown className="w-6 h-6 transition-transform" />
          ) : (
            <Sparkles className="w-5.5 h-5.5 text-slate-50 animate-pulse" />
          )}
        </button>
      </div>

      {/* Chat Window Panel: Fullscreen on mobile, Floating card on desktop */}
      {isOpen && (
        <div className="fixed top-0 left-0 w-full h-[100dvh] sm:top-auto sm:bottom-24 sm:right-6 sm:left-auto sm:w-96 sm:h-[520px] z-[9998] flex flex-col bg-slate-950/98 sm:bg-slate-900/60 backdrop-blur-3xl sm:backdrop-blur-md border-t sm:border border-slate-900 sm:border-slate-800/80 rounded-none sm:rounded-3xl shadow-2xl overflow-hidden animate-panel-slide">
          
          {isVoiceMode ? (
            /* Immersive Voice Mode Screen */
            <div className="flex-1 flex flex-col justify-between p-6 relative">
              
              {/* Top Header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setIsVoiceMode(false);
                    if (isRecording) recognitionRef.current?.stop();
                  }}
                  className="p-2 -ml-2 rounded-full hover:bg-slate-900/40 text-slate-450 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Speaking to AI Bot</span>
                <div className="w-9" /> {/* Spacer to balance center alignment */}
              </div>

              {/* AI Subtitle Prompt */}
              <div className="text-center px-4 mt-6 min-h-[40px] flex items-center justify-center">
                <p className="text-sm text-slate-300 font-semibold leading-relaxed">
                  {displayedVoiceReply || "How can I help you?"}
                </p>
              </div>

              {/* Center circular wave visualizer (Acts as the main mic toggle button) */}
              <div className="flex-1 flex items-center justify-center py-6">
                <button
                  onClick={toggleRecording}
                  className="relative w-52 h-52 flex items-center justify-center focus:outline-none cursor-pointer group active:scale-95 transition-transform"
                >
                  {/* Ambient background glow */}
                  <div className={`absolute inset-0 rounded-full bg-indigo-500/10 blur-2xl ${isRecording ? 'animate-pulse group-hover:bg-indigo-500/20' : 'group-hover:bg-indigo-500/10'} transition-all`} />
                  
                  {/* Outer Pulsing Ring */}
                  {isRecording && (
                    <div className="absolute w-56 h-56 rounded-full border border-indigo-500/10 animate-ping pointer-events-none" style={{ animationDuration: '3s' }} />
                  )}

                  {/* Ring 1 - Cyan/Blue */}
                  <div className={`absolute w-48 h-48 rounded-full bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-500 ${isRecording ? 'animate-orb-1 opacity-70 blur-[1px]' : 'opacity-20'} flex items-center justify-center p-[2px] shadow-lg shadow-cyan-500/10`}>
                    <div className="w-full h-full rounded-full bg-slate-950" />
                  </div>
                  
                  {/* Ring 2 - Pink/Purple */}
                  <div className={`absolute w-[184px] h-[184px] rounded-full bg-gradient-to-bl from-pink-500 via-purple-600 to-indigo-500 ${isRecording ? 'animate-orb-2 opacity-60 blur-[1.5px]' : 'opacity-15'} flex items-center justify-center p-[1.5px]`}>
                    <div className="w-full h-full rounded-full bg-slate-950" />
                  </div>
                  
                  {/* Ring 3 - Yellow/Rose */}
                  <div className={`absolute w-[176px] h-[176px] rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-red-500 ${isRecording ? 'animate-orb-3 opacity-50 blur-[2px]' : 'opacity-10'} flex items-center justify-center p-[1px]`}>
                    <div className="w-full h-full rounded-full bg-slate-950" />
                  </div>

                  {/* Pulsing Core */}
                  <div className={`absolute w-36 h-36 rounded-full bg-gradient-to-tr from-cyan-500/5 via-indigo-500/15 to-purple-500/5 ${isRecording ? 'animate-pulse blur-md' : 'blur-sm'}`} />
                  
                  {/* Center mic icon inside core */}
                  <div className="absolute w-20 h-20 rounded-full bg-slate-900/40 border border-slate-800/80 flex items-center justify-center shadow-inner group-hover:border-slate-700 transition-colors">
                    {isRecording ? (
                      <Mic className="w-8 h-8 text-indigo-400 animate-pulse" />
                    ) : (
                      <MicOff className="w-8 h-8 text-slate-500" />
                    )}
                  </div>
                </button>
              </div>

              {/* User Real-time Transcription Text */}
              <div className="text-center px-6 min-h-[48px] flex items-center justify-center mb-6">
                <p className="text-xs text-slate-400 font-medium leading-relaxed italic max-w-xs">
                  {isRecording 
                    ? (speechTranscript || "Listening...") 
                    : (isGenerating ? "Processing command..." : "Tap visualizer orb to speak")}
                </p>
              </div>

              {/* Bottom Controls */}
              <div className="flex items-center justify-between px-12 pt-4 border-t border-slate-900 bg-transparent">
                {/* Keyboard Switcher */}
                <button
                  onClick={() => {
                    setIsVoiceMode(false);
                    if (isRecording) recognitionRef.current?.stop();
                  }}
                  className="p-3 rounded-full bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Switch to Keyboard"
                >
                  <MessageSquare className="w-4.5 h-4.5" />
                </button>

                {/* Close Button */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    if (isRecording) recognitionRef.current?.stop();
                  }}
                  className="p-3 rounded-full bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Close Assistant"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

            </div>
          ) : (
            /* Standard Keyboard Chat View */
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-900 bg-transparent flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm text-slate-50 tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">MirAIe AI</h3>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase">Assistant</p>
                  </div>
                </div>

                {/* Header Controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`p-1.5 rounded-lg transition-all ${
                      voiceEnabled
                        ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                    title={voiceEnabled ? 'Mute AI Voice' : 'Unmute AI Voice'}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={clearChat}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
                    title="Clear Chat History"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      if (isRecording) recognitionRef.current?.stop();
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Area (Gemini minimalistic styling) */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                {messages.map((msg) => {
                  const isAi = msg.sender === 'ai';
                  return (
                    <div key={msg.id} className={`flex items-start gap-3 ${isAi ? '' : 'justify-end'}`}>
                      {isAi && (
                        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-blue-500/10 to-purple-500/10 flex items-center justify-center shrink-0 mt-0.5 border border-blue-500/10 shadow-sm">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                      )}

                      <div className={`flex flex-col gap-1 ${isAi ? 'flex-1' : 'max-w-[80%]'}`}>
                        {/* Message Bubble/Text */}
                        {isAi ? (
                          /* AI Message: Borderless, Bubbleless, Gemini style text */
                          <div className="text-xs text-slate-200 leading-relaxed font-normal whitespace-pre-line">
                            {msg.text}

                            {/* Control Command Summary Badge */}
                            {msg.type === 'control' && msg.actions && (
                              <div className="mt-3 pt-2.5 border-t border-slate-900/50 flex flex-wrap gap-1.5">
                                {Object.entries(msg.actions).map(([key, val]) => (
                                  <span
                                    key={key}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-850 text-[10px] text-slate-400 font-semibold capitalize shadow-sm"
                                  >
                                    {key === 'power' && <Power className="w-2.5 h-2.5 text-blue-500" />}
                                    {key === 'temperature' && <Thermometer className="w-2.5 h-2.5 text-amber-500" />}
                                    {key}: {val === true ? 'ON' : val === false ? 'OFF' : String(val)}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Workflow Scheduler Summary Badge */}
                            {msg.type === 'workflow' && msg.workflow && (
                              <div className="mt-3 pt-2.5 border-t border-slate-900/50 space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-bold">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>Routine Scheduled: {msg.workflow.name}</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] text-indigo-300 font-semibold shadow-sm">
                                    {msg.workflow.runOnce ? 'Run Once' : 'Repeated'}
                                  </span>
                                  {msg.workflow.steps?.map((step, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-850 text-[9px] text-slate-400 font-medium"
                                    >
                                      {step.time} ➔ {step.actions?.power === 'off' ? 'Power Off' : `${step.actions?.temperature || 'Cool'}°`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* User Message: Minimal rounded bubble */
                          <div className="px-4 py-2 bg-slate-900/80 border border-slate-850 text-xs text-slate-200 rounded-2xl rounded-tr-none font-medium leading-relaxed shadow-sm">
                            {msg.text}
                          </div>
                        )}
                        
                        {/* Timestamp */}
                        <span className={`text-[8px] text-slate-600 font-semibold tracking-wider ${!isAi && 'self-end'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Generating Output Loading Indicator */}
                {isGenerating && (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-blue-500/10 to-purple-500/10 flex items-center justify-center shrink-0 mt-0.5 border border-blue-500/10">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    </div>
                    <div className="flex gap-1.5 items-center py-1">
                      <span className="text-[11px] font-bold tracking-wide bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent animate-pulse">AI is thinking</span>
                      <div className="flex gap-1 items-center mt-1">
                        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-[10px] text-rose-400 font-semibold tracking-wide">
                    {errorMsg}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions Scroll Area */}
              <div className="px-4 py-2 border-t border-slate-900/50 bg-slate-950/20">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {QUICK_PROMPTS.map((promptText, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(promptText)}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-slate-900/40 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-[10px] text-slate-400 hover:text-slate-200 font-bold transition-all shadow-sm"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Panel (Gemini modern integrated input pill) */}
              <div className="p-4 border-t border-slate-900 bg-transparent flex items-center">
                <div className="flex-1 flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-850 focus-within:border-blue-500/30 focus-within:ring-1 focus-within:ring-blue-500/10 px-4 py-2 transition-all">
                  {isRecording ? (
                    /* Waveform Animation */
                    <div className="flex-1 flex items-center justify-between h-8">
                      <span className="text-xs text-blue-400 font-bold animate-pulse">Listening...</span>
                      <div className="flex items-center gap-1.5 flex-nowrap">
                        <div className="w-0.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave-1" style={{ height: '18px' }} />
                        <div className="w-0.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave-2" style={{ height: '24px' }} />
                        <div className="w-0.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave-3" style={{ height: '20px' }} />
                        <div className="w-0.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave-4" style={{ height: '22px' }} />
                        <div className="w-0.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave-5" style={{ height: '16px' }} />
                      </div>
                    </div>
                  ) : (
                    /* Regular Text Input */
                    <input
                      type="text"
                      placeholder="Ask AI or say a command..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-slate-200 placeholder-slate-600 text-xs font-semibold py-1.5 focus:ring-0 focus:outline-none"
                    />
                  )}

                  {/* Integrated Control Buttons inside the pill */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isRecording && inputValue.trim() && (
                      <button
                        onClick={() => handleSendMessage()}
                        className="p-1.5 text-blue-500 hover:text-blue-400 hover:bg-slate-800/40 rounded-lg transition-colors cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => setIsVoiceMode(true)}
                      className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 rounded-lg transition-all cursor-pointer"
                      title="Switch to Voice Mode"
                    >
                      <WaveformIcon className="w-4 h-4 text-indigo-400" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
