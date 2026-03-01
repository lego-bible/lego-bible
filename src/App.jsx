import React, { useState, useRef } from 'react';
import { BookOpen, Copy, Trash2, Search, Edit3, Loader2, FileText, CheckCircle, Mic, Users, LayoutGrid } from 'lucide-react';

// 실행 환경에서 API 키가 자동으로 주입됩니다.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// API 호출 유틸리티 (지수 백오프 재시도 로직 포함)
const fetchGeminiWithRetry = async (prompt, isJson = false) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const systemPrompt = "당신은 깊이 있는 신학적 지식을 갖춘 전문 목회자이자 성경 학자입니다. 출력은 반드시 한국어로 작성하며, 단락을 명확히 구분하여 읽기 쉽게 만드세요.";

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  if (isJson) {
    payload.generationConfig = { responseMimeType: "application/json" };
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("No text in response");
      return text;
      
    } catch (error) {
      lastError = error;
      if (i < 4) {
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  }
  
  alert("일시적인 네트워크 오류이거나 응답 지연입니다. 잠시 후 다시 시도해주세요.");
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
    if (!book || !chapter || !startVerse || !endVerse) {
      alert("성경책, 장, 절을 모두 입력해주세요.");
      return;
    }

    setIsResearching(true);
    setResearchData(null);
    setSuggestedTopics([]);
    setOutputResult(null);
    
    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      
      위 본문에 대한 연구 자료를 작성해주세요.
      반드시 아래와 같은 형태의 JSON 포맷으로 응답하세요.
      
      {
        "researchContent": "다음 4가지(1.역사적/문화적 배경, 2.문맥 및 문학적 구조, 3.주요 단어 및 신학적 의미, 4.현대적 적용점)로 명확하게 분류해서 정리한 매우 상세한 텍스트",
        "suggestedTopics": ["본문 기반 추천 주제 1", "본문 기반 추천 주제 2", "본문 기반 추천 주제 3"]
      }
    `;

    try {
      const result = await fetchGeminiWithRetry(prompt, true);
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch (parseError) {
        parsed = {
          researchContent: result,
          suggestedTopics: ["주제를 직접 입력해주세요"]
        };
      }
      setResearchData(parsed.researchContent);
      setSuggestedTopics(parsed.suggestedTopics || []);
    } catch (error) {
      console.error("연구 실패:", error);
    } finally {
      setIsResearching(false);
    }
  };

  const handleGenerateOutput = async (outputType) => {
    if (!topic) {
      alert("원하시는 주제를 먼저 입력해주세요.");
      return;
    }

    setIsGenerating(true);
    setActiveOutputTask(outputType);
    setOutputResult(null);

    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      사용자 지정 주제: ${topic}
      목표 형식: ${outputType}

      위 본문과 사용자가 지정한 주제를 바탕으로 '${outputType}'를 작성해주세요.

      [중요 지시사항]
      1. 분량: 매우 상세하고 깊이 있게 작성해야 합니다.
      2. 구조: 서론, 본론(대지 3개 이상), 결론, 그리고 ${outputType}의 특성에 맞는 질문이나 활동 지침 등을 포함하세요.
      3. 서식: 단락을 명확하게 나누고, 주요 제목은 '### 제목'과 같은 형태로 구분하여 시각적으로 읽기 편하게 만드세요.
    `;

    try {
      const result = await fetchGeminiWithRetry(prompt, false);
      setOutputResult({ type: outputType, content: result });
      
      // 스크롤 이동
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 300);
      
    } catch (error) {
      console.error("생성 실패:", error);
    } finally {
      setIsGenerating(false);
      setActiveOutputTask('');
    }
  };

  const handleCopy = (position) => {
    if (!outputResult) return;
    const textArea = document.createElement("textarea");
    textArea.value = outputResult.content;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      if (position === 'top') {
        setCopiedTop(true);
        setTimeout(() => setCopiedTop(false), 2000);
      } else {
        setCopiedBottom(true);
        setTimeout(() => setCopiedBottom(false), 2000);
      }
    } catch (err) {
      console.error("복사 실패:", err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden flex flex-wrap justify-center items-center z-0 text-3xl font-serif leading-loose break-all p-4">
        {Array(20).fill("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος. ").join('')}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <header className="flex items-center justify-center mb-12 space-x-4">
          <BookOpen className="w-10 h-10 text-amber-700" />
          <h1 className="text-4xl font-extrabold text-amber-900 tracking-tight">LEGO BIBLE</h1>
        </header>

        <div className="space-y-8">
          {/* 1. 성경 본문 선택 */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100/50">
            <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
              <Search className="w-5 h-5 mr-2" /> 1. 성경 본문 선택
            </h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-slate-500 mb-1">성경책</label>
                <input type="text" className="w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow" value={book} onChange={e => setBook(e.target.value)} placeholder="예: 요한복음"/>
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-slate-500 mb-1">장</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow" value={chapter} onChange={e => setChapter(e.target.value)} placeholder="장"/>
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-slate-500 mb-1">시작 절</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow" value={startVerse} onChange={e => setStartVerse(e.target.value)} placeholder="시작"/>
              </div>
              <div className="flex items-center pb-3 font-bold text-slate-400">~</div>
              <div className="w-24">
                <label className="block text-sm font-medium text-slate-500 mb-1">끝 절</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none transition-shadow" value={endVerse} onChange={e => setEndVerse(e.target.value)} placeholder="끝"/>
              </div>
              <button onClick={handleResearch} disabled={isResearching} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center min-w-[160px] justify-center transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed">
                {isResearching ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> 연구 중...</> : '연구 자료 찾기'}
              </button>
            </div>
          </section>

          {/* 2. 본문 연구 자료 */}
          {researchData && (
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" /> 2. 본문 연구 자료
              </h2>
              <div className="prose max-w-none bg-amber-50/50 p-6 rounded-xl border border-amber-100 whitespace-pre-wrap leading-relaxed text-slate-700">
                {researchData}
              </div>
              <div className="mt-8 border-t border-slate-100 pt-6">
                <h3 className="text-lg font-bold text-amber-800 mb-3 flex items-center"><Edit3 className="w-5 h-5 mr-2" /> 원하는 주제 입력</h3>
                <input type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-lg transition-all" value={topic} onChange={e => setTopic(e.target.value)} placeholder="주제를 직접 입력하시거나 아래 추천 주제를 클릭하세요."/>
                {suggestedTopics.length > 0 && (
                  <div className="mt-4 bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <span className="text-sm text-amber-800 font-semibold mb-3 block">💡 추천 주제 (클릭하면 바로 입력됩니다):</span>
                    <div className="flex flex-wrap gap-2">
                      {suggestedTopics.map((t, i) => (
                        <button key={i} onClick={() => setTopic(t)} className="px-4 py-2 bg-white border border-amber-200 rounded-full text-sm font-medium text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-all shadow-sm">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 3. 결과물 제작 항목 선택 */}
          {researchData && (
            <section ref={section3Ref} className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100/50 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
              <h2 className="text-xl font-bold text-amber-800 mb-4">3. 결과물 제작 항목 선택</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { type: '설교문', icon: Mic, desc: '강해 및 메시지 전달' },
                  { type: '성경 공부교재', icon: FileText, desc: '소그룹 나눔 및 질문' },
                  { type: '비블리오드라마 교재', icon: Users, desc: '입체적 성경 체험' },
                  { type: '공동체 활동 교재', icon: LayoutGrid, desc: '다양한 적용 활동' }
                ].map(({ type, icon: Icon, desc }) => {
                  const isActive = activeOutputTask === type;
                  const isReady = topic && !isGenerating && !isActive;
                  return (
                    <button key={type} onClick={() => handleGenerateOutput(type)} disabled={(!topic || isGenerating) && !isActive} className={`p-6 flex flex-col items-center rounded-2xl border-2 transition-all duration-300 ${isActive ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-md transform scale-[1.02]' : isReady ? 'border-amber-200 bg-white text-slate-700 hover:border-amber-500 hover:bg-amber-50 hover:shadow-lg hover:-translate-y-1' : 'border-slate-200 bg-slate-50 text-slate-400 opacity-70 cursor-not-allowed'}`}>
                      {isActive ? <Loader2 className="w-10 h-10 mb-3 animate-spin text-amber-600" /> : <Icon className={`w-10 h-10 mb-3 ${isReady ? 'text-amber-600' : 'text-slate-400'}`} />}
                      <span className="font-bold text-lg mb-1">{type}</span><span className="text-xs font-medium opacity-80 text-center">{desc}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. 최종 결과물 */}
          {outputResult && (
            <section className="bg-white p-0 rounded-2xl shadow-md border border-amber-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-amber-50 px-6 py-4 flex flex-wrap gap-4 justify-between items-center border-b border-amber-100">
                <h2 className="text-xl font-bold text-amber-900 flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-green-600" /> {outputResult.type} 생성 완료</h2>
                <div className="flex gap-2">
                  <button onClick={() => setOutputResult(null)} className="flex items-center px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
                    <Trash2 className="w-4 h-4 mr-1.5" /> 삭제
                  </button>
                  <button onClick={() => handleCopy('top')} className="flex items-center px-3 py-1.5 bg-white border border-amber-200 rounded-md text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors">
                    <Copy className="w-4 h-4 mr-1.5" /> {copiedTop ? '복사됨!' : '복사'}
                  </button>
                  <button onClick={() => { setOutputResult(null); section3Ref.current?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-md text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors">
                    다른 항목 선택
                  </button>
                </div>
              </div>
              <div className="p-8 prose prose-amber max-w-none leading-loose whitespace-pre-wrap text-lg bg-[#fafcfc] text-slate-800">
                {outputResult.content}
              </div>
              <div className="bg-amber-50 px-6 py-4 flex justify-end gap-2 border-t border-amber-100">
                <button onClick={() => setOutputResult(null)} className="flex items-center px-4 py-2 bg-red-50 border border-red-200 rounded-md text-red-600 hover:bg-red-100 transition-colors font-medium shadow-sm">
                  <Trash2 className="w-4 h-4 mr-2" /> 삭제하기
                </button>
                <button onClick={() => handleCopy('bottom')} className="flex items-center px-4 py-2 bg-white border border-amber-300 rounded-md text-amber-700 hover:bg-amber-100 transition-colors font-medium shadow-sm">
                  <Copy className="w-4 h-4 mr-2" /> {copiedBottom ? '클립보드 복사 완료' : '전체 내용 복사하기'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}