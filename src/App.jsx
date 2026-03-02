import React, { useState, useRef } from 'react';
import { BookOpen, Copy, Trash2, Search, Edit3, Loader2, FileText, CheckCircle, Mic, Users, LayoutGrid } from 'lucide-react';

/**
 * 💡 환경 변수 안전하게 가져오기
 */
const getApiKey = () => {
  try {
    const env = import.meta.env;
    const key = env ? env.VITE_GEMINI_API_KEY : "AIzaSyDOt2svILiU5sLr8jzwm6MJxOR3tO7j4HY";
    return key ? key.trim() : "";
  } catch (e) {
    return "";
  }
};

const apiKey = getApiKey();

/**
 * 🚀 Gemini API 호출 유틸리티
 */
const fetchGeminiWithRetry = async (prompt, isJson = false) => {
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.");
  }

  // 가장 안정적인 v1beta 엔드포인트와 gemini-1.5-flash 모델 조합을 사용합니다.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const systemPrompt = "당신은 깊이 있는 신학적 지식을 갖춘 전문 목회자이자 성경 학자입니다. 출력은 반드시 한국어로 작성하며, 단락을 명확히 구분하여 읽기 쉽게 만드세요.";

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  if (isJson) {
    payload.generationConfig = { 
      responseMimeType: "application/json"
    };
  }

  const delays = [1000, 2000, 4000, 8000, 16000];
  let lastError = null;

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const errorData = await response.json().catch(() => ({}));

      if (!response.ok) {
        // 에러 발생 시 구글이 보내준 실제 상세 메시지를 콘솔에 출력합니다.
        console.error("구글 API 에러 상세:", errorData);
        
        if (response.status === 404) {
          throw new Error("모델을 찾을 수 없습니다(404). 모델 이름이나 API 권한을 확인하세요.");
        }
        if (response.status === 400) {
          throw new Error(`잘못된 요청(400): ${errorData.error?.message || '입력값을 확인하세요.'}`);
        }
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      const text = errorData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답에 텍스트가 포함되어 있지 않습니다.");
      return text;
      
    } catch (error) {
      lastError = error;
      if (i < 4) {
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  }
  
  throw lastError;
};

export default function App() {
  const [book, setBook] = useState('');
  const [chapter, setChapter] = useState('');
  const [startVerse, setStartVerse] = useState('');
  const [endVerse, setEndVerse] = useState('');
  
  const [researchData, setResearchData] = useState(null);
  const [isResearching, setIsResearching] = useState(false);
  
  const [topic, setTopic] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  
  const [outputResult, setOutputResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeOutputTask, setActiveOutputTask] = useState('');
  
  const [copiedTop, setCopiedTop] = useState(false);
  const [copiedBottom, setCopiedBottom] = useState(false);

  const section3Ref = useRef(null);

  const handleResearch = async () => {
    if (!apiKey) {
      alert("API 키가 없습니다. Vercel 환경 변수 설정을 확인해 주세요.");
      return;
    }
    if (!book || !chapter || !startVerse || !endVerse) {
      alert("성경책, 장, 절을 모두 입력해 주세요.");
      return;
    }

    setIsResearching(true);
    setResearchData(null);
    setSuggestedTopics([]);
    setOutputResult(null);
    
    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      위 본문에 대한 연구 자료를 작성해 주세요.
      반드시 아래와 같은 JSON 포맷으로만 응답하세요.
      {
        "researchContent": "역사적 배경, 문맥, 신학적 의미, 적용점을 포함한 상세한 텍스트",
        "suggestedTopics": ["추천 주제 1", "추천 주제 2", "추천 주제 3"]
      }
    `;

    try {
      const result = await fetchGeminiWithRetry(prompt, true);
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch {
        parsed = { researchContent: result, suggestedTopics: ["본문 메시지 연구"] };
      }
      setResearchData(parsed.researchContent);
      setSuggestedTopics(parsed.suggestedTopics || []);
    } catch (error) {
      alert(`연구 실패: ${error.message}`);
    } finally {
      setIsResearching(false);
    }
  };

  const handleGenerateOutput = async (outputType) => {
    if (!topic) {
      alert("주제를 먼저 입력하거나 선택해 주세요.");
      return;
    }

    setIsGenerating(true);
    setActiveOutputTask(outputType);
    setOutputResult(null);

    const prompt = `본문: ${book} ${chapter}:${startVerse}-${endVerse}\n주제: ${topic}\n형식: ${outputType}\n위 내용을 바탕으로 깊이 있는 내용을 작성해 주세요.`;

    try {
      const result = await fetchGeminiWithRetry(prompt, false);
      setOutputResult({ type: outputType, content: result });
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 300);
    } catch (error) {
      alert(`생성 실패: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setActiveOutputTask('');
    }
  };

  const handleCopy = (pos) => {
    if (!outputResult) return;
    const el = document.createElement('textarea');
    el.value = outputResult.content;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (pos === 'top') { setCopiedTop(true); setTimeout(() => setCopiedTop(false), 2000); }
    else { setCopiedBottom(true); setTimeout(() => setCopiedBottom(false), 2000); }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden flex flex-wrap justify-center items-center z-0 text-3xl font-serif leading-loose p-4 select-none">
        {Array(15).fill("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ Ἐν ἀρχῇ ἦν ὁ λόγος ").join('')}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <header className="flex flex-col items-center mb-12 space-y-2">
          <div className="flex items-center space-x-4">
            <BookOpen className="w-10 h-10 text-amber-700" />
            <h1 className="text-4xl font-black text-amber-900 tracking-tighter uppercase">Lego Bible</h1>
          </div>
          <p className="text-amber-800/60 font-medium">성경 연구의 모든 조각을 하나로</p>
        </header>

        <div className="space-y-8">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100">
            <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
              <Search className="w-5 h-5 mr-2" /> 1. 본문 범위 설정
            </h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-400 mb-1">성경</label>
                <input type="text" className="w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" value={book} onChange={e => setBook(e.target.value)} placeholder="예: 창세기"/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">장</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={chapter} onChange={e => setChapter(e.target.value)}/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">시작</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={startVerse} onChange={e => setStartVerse(e.target.value)}/>
              </div>
              <div className="pb-4 text-slate-300">~</div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">끝</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={endVerse} onChange={e => setEndVerse(e.target.value)}/>
              </div>
              <button onClick={handleResearch} disabled={isResearching} className="px-8 py-3.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl font-bold transition-all disabled:opacity-50">
                {isResearching ? '연구 중...' : '연구 자료 찾기'}
              </button>
            </div>
          </section>

          {researchData && (
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100 animate-in fade-in slide-in-from-bottom-2">
              <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" /> 2. 연구 분석 내용
              </h2>
              <div className="prose max-w-none bg-amber-50/30 p-6 rounded-2xl border border-amber-100 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {researchData}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100">
                <h3 className="text-lg font-bold text-amber-800 mb-3 flex items-center"><Edit3 className="w-5 h-5 mr-2" /> 주제 선택 및 입력</h3>
                <input type="text" className="w-full p-4 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-amber-500" value={topic} onChange={e => setTopic(e.target.value)} placeholder="원하는 주제를 입력하세요."/>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestedTopics.map((t, i) => (
                    <button key={i} onClick={() => setTopic(t)} className="px-4 py-2 bg-white border border-amber-200 rounded-full text-sm font-semibold text-amber-900 hover:bg-amber-50">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {researchData && (
            <section ref={section3Ref} className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100">
              <h2 className="text-xl font-bold text-amber-800 mb-6">3. 생성할 사역 자료 선택</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { type: '설교문', icon: Mic, desc: '메시지 구성' },
                  { type: '성경 공부교재', icon: FileText, desc: '질문과 나눔' },
                  { type: '비블리오드라마 교재', icon: Users, desc: '성경 체험' },
                  { type: '공동체 활동 교재', icon: LayoutGrid, desc: '적용과 활동' }
                ].map(({ type, icon: Icon, desc }) => {
                  const isActive = activeOutputTask === type;
                  return (
                    <button key={type} onClick={() => handleGenerateOutput(type)} disabled={!topic || isGenerating} className={`p-6 flex flex-col items-center rounded-2xl border-2 transition-all ${isActive ? 'border-amber-600 bg-amber-50' : 'border-slate-50 hover:border-amber-300'}`}>
                      {isActive ? <Loader2 className="w-10 h-10 mb-3 animate-spin text-amber-600" /> : <Icon className="w-10 h-10 mb-3 text-amber-700" />}
                      <span className="font-bold">{type}</span>
                      <span className="text-[10px] uppercase tracking-widest mt-1 text-slate-400">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {outputResult && (
            <section className="bg-white rounded-3xl shadow-xl border border-amber-200 overflow-hidden animate-in zoom-in-95">
              <div className="bg-amber-700 px-6 py-4 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center"><CheckCircle className="w-5 h-5 mr-2" /> {outputResult.type} 완료</h2>
                <div className="flex gap-2">
                  <button onClick={() => setOutputResult(null)} className="px-4 py-1.5 bg-amber-800 text-white rounded-lg text-xs font-bold hover:bg-red-900 transition-colors">삭제</button>
                  <button onClick={() => handleCopy('top')} className="px-4 py-1.5 bg-white text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-50">{copiedTop ? '복사 완료!' : '텍스트 복사'}</button>
                </div>
              </div>
              <div className="p-10 prose prose-amber max-w-none whitespace-pre-wrap text-lg leading-relaxed text-slate-800">
                {outputResult.content}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}