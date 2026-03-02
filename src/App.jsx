import React, { useState, useRef } from 'react';
import { BookOpen, Copy, Trash2, Search, Edit3, Loader2, FileText, CheckCircle, Mic, Users, LayoutGrid } from 'lucide-react';

/**
 * 💡 환경 변수 안전하게 가져오기
 */
const getApiKey = () => {
  try {
    const env = import.meta.env;
    const key = env ? env.VITE_GEMINI_API_KEY : "VITE_GEMINI_API_KEY";
    return key ? key.trim() : "";
  } catch (e) {
    return "";
  }
};

const apiKey = getApiKey();

/**
 * 🚀 Gemini API 호출 유틸리티
 * 400 Bad Request를 방지하기 위해 가장 표준적인 v1 엔드포인트와 페이로드 구조를 사용합니다.
 */
const fetchGeminiWithRetry = async (prompt, isJson = false) => {
  if (!apiKey) {
    throw new Error("API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.");
  }

  // 🚨 v1 정식 엔드포인트를 사용하여 안정성을 확보합니다.
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 프롬프트 구성 (시스템 지침을 사용자 메시지에 통합하여 호환성 극대화)
  const fullPrompt = isJson 
    ? `${prompt}\n\n반드시 결과는 JSON 형식으로만 응답하세요.`
    : `당신은 깊이 있는 신학적 지식을 갖춘 전문 성경 학자입니다. 모든 답변은 한국어로 작성하고 가독성 있게 구성하세요.\n\n요청사항: ${prompt}`;

  const payload = {
    contents: [{ 
      parts: [{ text: fullPrompt }] 
    }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096,
    }
  };

  // JSON 모드가 필요할 때만 설정 추가
  if (isJson) {
    payload.generationConfig.responseMimeType = "application/json";
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

      const responseData = await response.json();

      if (!response.ok) {
        console.error("구글 API 상세 에러:", responseData);
        // API 키가 유효하지 않거나 권한이 없는 경우에 대한 메시지
        if (response.status === 400) {
          throw new Error(`잘못된 요청(400): ${responseData.error?.message || '입력 데이터 형식을 확인하세요.'}`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error("API 키 인증 실패: 키가 유효한지, 혹은 할당량이 만료되었는지 확인하세요.");
        }
        throw new Error(`API 오류 (${response.status}): ${responseData.error?.message || '알 수 없는 오류'}`);
      }
      
      const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답 결과가 비어 있습니다.");
      return text;
      
    } catch (error) {
      lastError = error;
      if (i < 4) await new Promise(res => setTimeout(res, delays[i]));
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
      alert("API 키가 설정되지 않았습니다.");
      return;
    }
    if (!book || !chapter || !startVerse || !endVerse) {
      alert("성경 본문 범위를 정확히 입력해 주세요.");
      return;
    }

    setIsResearching(true);
    setResearchData(null);
    setSuggestedTopics([]);
    setOutputResult(null);
    
    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      위 본문에 대해 다음 4가지 요소(역사적 배경, 문맥적 구조, 신학적 의미, 현대적 적용)를 포함한 연구 자료를 작성해 주세요.
      결과는 반드시 아래의 JSON 스키마를 따르는 하나의 JSON 객체여야 합니다:
      {
        "researchContent": "상세한 연구 텍스트",
        "suggestedTopics": ["추천 주제 1", "추천 주제 2", "추천 주제 3"]
      }
    `;

    try {
      const result = await fetchGeminiWithRetry(prompt, true);
      const parsed = JSON.parse(result);
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
      alert("주제를 입력하거나 선택해 주세요.");
      return;
    }

    setIsGenerating(true);
    setActiveOutputTask(outputType);
    setOutputResult(null);

    const prompt = `본문: ${book} ${chapter}:${startVerse}-${endVerse}\n주제: ${topic}\n형식: ${outputType}\n위 정보를 바탕으로 전문적인 사역 자료를 작성해 주세요.`;

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
        {Array(10).fill("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ ").join('')}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <header className="flex flex-col items-center mb-12 space-y-2">
          <div className="flex items-center space-x-4">
            <BookOpen className="w-10 h-10 text-amber-700" />
            <h1 className="text-4xl font-black text-amber-900 tracking-tighter uppercase">Lego Bible</h1>
          </div>
          <p className="text-amber-800/60 font-medium">말씀 연구의 조각을 맞추다</p>
        </header>

        <div className="space-y-8">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100">
            <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
              <Search className="w-5 h-5 mr-2" /> 1. 본문 범위 설정
            </h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Bible Book</label>
                <input type="text" className="w-full p-3 bg-slate-50 border-0 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" value={book} onChange={e => setBook(e.target.value)} placeholder="예: 요한복음"/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Chapter</label>
                <input type="number" className="w-full p-3 bg-slate-50 border-0 rounded-xl outline-none" value={chapter} onChange={e => setChapter(e.target.value)}/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Start</label>
                <input type="number" className="w-full p-3 bg-slate-50 border-0 rounded-xl outline-none" value={startVerse} onChange={e => setStartVerse(e.target.value)}/>
              </div>
              <div className="pb-4 text-slate-300">~</div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">End</label>
                <input type="number" className="w-full p-3 bg-slate-50 border-0 rounded-xl outline-none" value={endVerse} onChange={e => setEndVerse(e.target.value)}/>
              </div>
              <button onClick={handleResearch} disabled={isResearching} className="px-8 py-3.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl font-bold transition-all disabled:opacity-50">
                {isResearching ? '연구 중...' : '연구 자료 찾기'}
              </button>
            </div>
          </section>

          {researchData && (
            <section className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100">
              <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" /> 2. 연구 분석 내용
              </h2>
              <div className="prose max-w-none bg-amber-50/30 p-8 rounded-3xl border border-amber-100 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {researchData}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100">
                <h3 className="text-lg font-bold text-amber-800 mb-3 flex items-center"><Edit3 className="w-5 h-5 mr-2" /> 주제 선택 및 입력</h3>
                <input type="text" className="w-full p-4 bg-slate-50 border-0 rounded-xl outline-none focus:ring-2 focus:ring-amber-500" value={topic} onChange={e => setTopic(e.target.value)} placeholder="원하는 주제를 입력하세요."/>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestedTopics.map((t, i) => (
                    <button key={i} onClick={() => setTopic(t)} className="px-4 py-2 bg-white border border-amber-200 rounded-full text-sm font-semibold text-amber-900 hover:bg-amber-100 transition-colors">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {researchData && (
            <section ref={section3Ref} className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100">
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
            <section className="bg-white rounded-3xl shadow-xl border border-amber-200 overflow-hidden">
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