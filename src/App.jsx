import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Copy, Trash2, Search, Edit3, Loader2, FileText, CheckCircle, Mic, Users, LayoutGrid, AlertCircle } from 'lucide-react';

/**
 * 💡 환경 변수 안전하게 가져오기
 */
const getApiKey = () => {
  try {
    const env = import.meta.env;
    const key = env ? env.VITE_GEMINI_API_KEY : "AIzaSyDFexMx5okGxLNIaeITJ5sBPQfzdVMTdYM";
    return key ? key.trim() : "";
  } catch (e) {
    return "";
  }
};

const apiKey = getApiKey();

export default function App() {
  // --- 상태 관리 ---
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
  const [errorMessage, setErrorMessage] = useState("");

  const section3Ref = useRef(null);

  // 에러 메시지 5초 후 자동 삭제
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  /**
   * 🚀 Gemini API 호출 유틸리티
   * [중요] 구글 REST API는 반드시 snake_case 필드명을 사용해야 합니다.
   */
  const fetchGemini = async (prompt, isJson = false) => {
    if (!apiKey) {
      setErrorMessage("API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.");
      return null;
    }

    // v1 정식 엔드포인트 사용
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const systemInstruction = "당신은 깊이 있는 신학적 지식을 갖춘 전문 성경 학자이자 목회자입니다. 모든 답변은 한국어로 작성하며, 가독성 있게 단락을 구분하세요.";
    const fullPrompt = `${systemInstruction}\n\n요청사항: ${prompt}${isJson ? "\n\n반드시 결과는 다른 설명 없이 순수한 JSON 형식으로만 응답하세요." : ""}`;

    // 🚨 400 Bad Request 해결: 모든 필드 이름을 snake_case로 엄격히 교정
    const payload = {
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      generation_config: {
        temperature: 0.7,
        max_output_tokens: 4096,
        ...(isJson ? { response_mime_type: "application/json" } : {})
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("API Error Response:", data);
        const msg = data.error?.message || "알 수 없는 API 오류";
        throw new Error(`[${response.status}] ${msg}`);
      }
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답 결과가 비어 있습니다.");
      return text;
      
    } catch (error) {
      console.error("Fetch Error:", error);
      setErrorMessage(error.message);
      return null;
    }
  };

  /**
   * 🔍 1단계: 본문 연구 실행
   */
  const handleResearch = async () => {
    if (!book || !chapter || !startVerse || !endVerse) {
      setErrorMessage("성경 본문 정보(책, 장, 절)를 모두 입력해 주세요.");
      return;
    }

    setIsResearching(true);
    setResearchData(null);
    setSuggestedTopics([]);
    setOutputResult(null);
    
    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      위 본문을 (1)역사적 배경 (2)문맥 및 구조 (3)핵심 단어와 신학 (4)현대적 적용점으로 나누어 매우 상세히 분석해 주세요.
      결과는 반드시 아래 JSON 형식을 지켜야 합니다:
      {
        "researchContent": "상세 분석 텍스트",
        "suggestedTopics": ["본문 기반 추천 주제 1", "본문 기반 추천 주제 2", "본문 기반 추천 주제 3"]
      }
    `;

    const result = await fetchGemini(prompt, true);
    if (result) {
      try {
        const parsed = JSON.parse(result);
        setResearchData(parsed.researchContent);
        setSuggestedTopics(parsed.suggestedTopics || []);
      } catch (e) {
        setResearchData(result);
        setSuggestedTopics(["본문의 핵심 메시지"]);
      }
    }
    setIsResearching(false);
  };

  /**
   * 📝 2단계: 결과물(설교문 등) 생성 실행
   */
  const handleGenerateOutput = async (outputType) => {
    if (!topic) {
      setErrorMessage("주제를 먼저 입력하거나 추천 주제를 선택해 주세요.");
      return;
    }

    setIsGenerating(true);
    setActiveOutputTask(outputType);
    setOutputResult(null);

    const prompt = `
      성경 본문: ${book} ${chapter}:${startVerse}-${endVerse}
      선택한 주제: ${topic}
      제작할 형식: ${outputType}

      위 정보를 바탕으로 전문적인 ${outputType}를 작성해 주세요. 
      구성은 서론, 본론(대지 3개 이상), 결론, 나눔을 위한 질문을 포함해야 하며 깊이 있는 신학적 통찰을 담아주세요.
    `;

    const result = await fetchGemini(prompt, false);
    if (result) {
      setOutputResult({ type: outputType, content: result });
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 300);
    }
    setIsGenerating(false);
    setActiveOutputTask('');
  };

  const handleCopy = (pos) => {
    if (!outputResult) return;
    const el = document.createElement('textarea');
    el.value = outputResult.content;
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      if (pos === 'top') { setCopiedTop(true); setTimeout(() => setCopiedTop(false), 2000); }
      else { setCopiedBottom(true); setTimeout(() => setCopiedBottom(false), 2000); }
    } catch (err) {
      setErrorMessage("복사에 실패했습니다.");
    }
    document.body.removeChild(el);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans relative pb-24">
      {errorMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-lg animate-in slide-in-from-top-4">
          <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center space-x-3 border border-red-500">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p className="text-sm font-semibold flex-1">{errorMessage}</p>
            <button onClick={() => setErrorMessage("")} className="p-1 hover:bg-white/20 rounded-lg transition-colors">✕</button>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden flex flex-wrap justify-center items-center z-0 text-3xl font-serif select-none">
        {Array(12).fill("בְּרֵ아שִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ Ἐν ἀρχῇ ἦν ὁ λόγος ").join('')}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
        <header className="flex flex-col items-center mb-16 space-y-3">
          <div className="flex items-center space-x-4">
            <BookOpen className="w-12 h-12 text-amber-700" />
            <h1 className="text-5xl font-black text-amber-900 tracking-tighter uppercase italic">Lego Bible</h1>
          </div>
          <p className="text-amber-800/60 font-bold tracking-widest text-sm uppercase">말씀 연구와 사역 자료의 완성을 위한 조각</p>
        </header>

        <div className="space-y-10">
          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-amber-100">
            <h2 className="text-2xl font-bold text-amber-900 mb-6 flex items-center">
              <Search className="w-6 h-6 mr-3 text-amber-600" /> 1. 성경 본문 범위
            </h2>
            <div className="flex flex-wrap items-end gap-5">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Bible Book</label>
                <input type="text" className="w-full p-4 bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none text-lg font-medium" value={book} onChange={e => setBook(e.target.value)} placeholder="예: 로마서"/>
              </div>
              <div className="w-24">
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Chap</label>
                <input type="number" className="w-full p-4 bg-slate-50 border-0 rounded-2xl outline-none text-lg font-medium" value={chapter} onChange={e => setChapter(e.target.value)}/>
              </div>
              <div className="w-24">
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">Start</label>
                <input type="number" className="w-full p-4 bg-slate-50 border-0 rounded-2xl outline-none text-lg font-medium" value={startVerse} onChange={e => setStartVerse(e.target.value)}/>
              </div>
              <div className="pb-5 text-slate-300 font-black text-xl">~</div>
              <div className="w-24">
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">End</label>
                <input type="number" className="w-full p-4 bg-slate-50 border-0 rounded-2xl outline-none text-lg font-medium" value={endVerse} onChange={e => setEndVerse(e.target.value)}/>
              </div>
              <button onClick={handleResearch} disabled={isResearching} className="px-10 py-4 bg-amber-700 hover:bg-amber-800 text-white rounded-2xl font-black text-lg transition-all shadow-lg hover:shadow-amber-200 disabled:opacity-50 active:scale-95">
                {isResearching ? <Loader2 className="w-6 h-6 animate-spin" /> : '연구 시작'}
              </button>
            </div>
          </section>

          {researchData && (
            <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-amber-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold text-amber-900 mb-6 flex items-center">
                <FileText className="w-6 h-6 mr-3 text-amber-600" /> 2. 연구 분석 결과
              </h2>
              <div className="prose max-w-none bg-amber-50/30 p-10 rounded-[2rem] border border-amber-100 whitespace-pre-wrap text-slate-700 leading-relaxed text-lg">
                {researchData}
              </div>
              <div className="mt-10 pt-8 border-t border-slate-100">
                <h3 className="text-xl font-bold text-amber-900 mb-4 flex items-center"><Edit3 className="w-6 h-6 mr-3 text-amber-600" /> 사역 주제 선택</h3>
                <input type="text" className="w-full p-5 bg-slate-50 border-0 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-lg" value={topic} onChange={e => setTopic(e.target.value)} placeholder="원하는 사역 주제를 입력하거나 아래 추천 항목을 선택하세요."/>
                <div className="mt-5 flex flex-wrap gap-3">
                  {suggestedTopics.map((t, i) => (
                    <button key={i} onClick={() => setTopic(t)} className="px-5 py-2.5 bg-white border-2 border-amber-100 rounded-full text-sm font-bold text-amber-900 hover:bg-amber-100 hover:border-amber-300 transition-all shadow-sm">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {researchData && (
            <section ref={section3Ref} className="bg-white p-8 rounded-[2rem] shadow-sm border border-amber-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold text-amber-900 mb-8">3. 생성할 사역 자료 선택</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { type: '설교문', icon: Mic, desc: '신학적 강해 및 메시지' },
                  { type: '성경 공부교재', icon: FileText, desc: '소그룹 나눔과 질문지' },
                  { type: '비블리오드라마 교재', icon: Users, desc: '입체적 성경 체험 가이드' },
                  { type: '공동체 활동 교재', icon: LayoutGrid, desc: '적용 중심의 활동 프로그램' }
                ].map(({ type, icon: Icon, desc }) => {
                  const isActive = activeOutputTask === type;
                  return (
                    <button key={type} onClick={() => handleGenerateOutput(type)} disabled={!topic || isGenerating} className={`p-8 flex flex-col items-center text-center rounded-[2rem] border-4 transition-all duration-300 ${isActive ? 'border-amber-600 bg-amber-50 shadow-inner' : 'border-slate-50 bg-white hover:border-amber-400 hover:shadow-xl hover:-translate-y-1'}`}>
                      {isActive ? <Loader2 className="w-12 h-12 mb-4 animate-spin text-amber-600" /> : <Icon className="w-12 h-12 mb-4 text-amber-700" />}
                      <span className="font-black text-xl mb-2">{type}</span>
                      <span className="text-xs font-bold text-slate-400 leading-tight">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {outputResult && (
            <section className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-amber-100 overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="bg-amber-800 px-8 py-6 flex justify-between items-center text-white">
                <h2 className="text-xl font-black flex items-center"><CheckCircle className="w-6 h-6 mr-3 text-amber-300" /> {outputResult.type} 생성 완료</h2>
                <div className="flex gap-3">
                  <button onClick={() => setOutputResult(null)} className="px-5 py-2 bg-amber-900/50 rounded-xl text-xs font-black hover:bg-red-600 transition-colors uppercase">Delete</button>
                  <button onClick={() => handleCopy('top')} className="px-5 py-2 bg-white text-amber-900 rounded-xl text-xs font-black hover:bg-amber-50 transition-colors uppercase">{copiedTop ? 'Copied!' : 'Copy Text'}</button>
                </div>
              </div>
              <div className="p-12 prose prose-amber max-w-none whitespace-pre-wrap text-xl leading-[1.8] text-slate-800 font-medium">
                {outputResult.content}
              </div>
              <div className="bg-amber-50 px-8 py-6 border-t border-amber-100 flex justify-end">
                <button onClick={() => handleCopy('bottom')} className="px-8 py-3 bg-amber-700 text-white rounded-xl font-black hover:bg-amber-800 transition-all shadow-md active:scale-95">
                  {copiedBottom ? '클립보드 복사 완료' : '전체 내용 복사하기'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}