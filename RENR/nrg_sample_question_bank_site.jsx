import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Flag,
  Headphones,
  Home,
  LayoutDashboard,
  Lock,
  LogIn,
  MoonStar,
  ShieldCheck,
  Stethoscope,
  TimerReset,
  UserCog,
  Users,
  Video,
} from 'lucide-react';

const studentProfileKey = 'nrg-soft-launch-student';

const domainIntro = [
  {
    code: 'NP',
    title: 'Nursing Practice',
    summary: 'Focuses on safe, holistic, evidence-based care using the nursing process. It asks what the nurse should assess, observe, and do safely.'
  },
  {
    code: 'PC',
    title: 'Professional Conduct',
    summary: 'Focuses on ethical and legal responsibility, confidentiality, accountability, patient rights, and behaviour that protects the public.'
  },
  {
    code: 'HPMW',
    title: 'Health Promotion and Maintenance of Wellness',
    summary: 'Focuses on prevention, lifestyle teaching, healthy choices, early intervention, and helping clients maintain wellness over time.'
  },
  {
    code: 'NLM',
    title: 'Nursing Leadership and Management',
    summary: 'Focuses on delegation, supervision, coordination of care, priority setting, and safe use of team resources.'
  },
  {
    code: 'COM',
    title: 'Communication',
    summary: 'Focuses on therapeutic interaction, empathy, patient-centred responses, clear exchange of information, and trust-building.'
  },
  {
    code: 'CDM',
    title: 'Clinical Decision Making and Intervention',
    summary: 'Focuses on recognizing cues, identifying the priority problem, and choosing the best immediate nursing action.'
  },
  {
    code: 'PD',
    title: 'Professional Development',
    summary: 'Focuses on lifelong learning, maintaining competence, recognizing learning needs, and improving professional practice.'
  }
];

const bankQuestions = [
  {
    id: 1,
    domain: 'Nursing Practice',
    topic: 'Renal Failure and Dialysis',
    stem: 'A 52-year-old client with chronic renal failure returns to the unit after hemodialysis. Thirty minutes later, the client reports headache, nausea, and increasing restlessness. The nurse notes intermittent twitching of both hands and repeated questioning by the client. Which nursing action should the nurse take first?',
    options: [
      'Reassure the client that these findings are expected after dialysis.',
      'Assess neurological status and notify the health care provider immediately.',
      'Offer oral fluids to replace losses from the dialysis session.',
      'Document the findings and continue close routine observation.'
    ],
    answer: 1,
    rationale: 'The client is showing possible dialysis disequilibrium syndrome with neurological changes after dialysis. The nurse should assess neurological status and report immediately because worsening cerebral fluid shifts can progress rapidly. The other options delay recognition of a potentially serious complication.',
    distractors: [
      'These findings are not simply expected recovery signs and should not be minimized.',
      'Oral fluids do not address the neurological complication and may be inappropriate depending on fluid restrictions.',
      'Documentation alone delays action when the client is showing acute neurological change.'
    ]
  },
  {
    id: 2,
    domain: 'Professional Conduct',
    topic: 'Confidentiality',
    stem: 'A client admitted to the medical ward says quietly, “Please do not discuss my diagnosis with my family until I am ready.” Later, the client’s brother asks the nurse, “What exactly is wrong with him?” Which response by the nurse is most appropriate?',
    options: [
      '“He will explain when he feels comfortable.”',
      '“He has a serious condition, but he is receiving treatment.”',
      '“I cannot discuss his condition without his permission.”',
      '“You should ask the doctor for the details.”'
    ],
    answer: 2,
    rationale: 'The best response clearly protects confidentiality and respects the client’s right to control disclosure of personal health information. Directing the family elsewhere or giving partial information still fails to uphold the client’s expressed wishes.',
    distractors: [
      'This is supportive, but it does not clearly state the nurse’s obligation to protect confidentiality.',
      'Any disclosure without permission breaches confidentiality.',
      'Redirecting to the doctor avoids the nurse’s ethical responsibility.'
    ]
  },
  {
    id: 3,
    domain: 'Communication',
    topic: 'Therapeutic Communication',
    stem: 'A client with newly diagnosed heart failure says, “I am overwhelmed. Everyone keeps telling me what I can’t do anymore.” Which response by the nurse is most therapeutic?',
    options: [
      '“You need to focus on the positive and stop worrying so much.”',
      '“Tell me which changes feel hardest for you right now.”',
      '“Many people live with heart failure, so you will get used to it.”',
      '“The important thing is that you simply follow instructions exactly.”'
    ],
    answer: 1,
    rationale: 'This response invites the client to identify the most difficult concern and supports expression of feelings. Therapeutic communication is open, nonjudgmental, and patient-centred. The other options minimize, direct, or shut down discussion.',
    distractors: [
      'This minimizes the client’s feelings.',
      'This offers false reassurance and does not explore the concern.',
      'This is directive and does not promote therapeutic expression.'
    ]
  },
  {
    id: 4,
    domain: 'Health Promotion and Maintenance of Wellness',
    topic: 'Diabetes Education',
    stem: 'A client with type 2 diabetes mellitus is preparing for discharge from the clinic. Which statement by the client shows the best understanding of health promotion?',
    options: [
      '“I will stop checking my blood sugar once I feel better.”',
      '“I should avoid all fruit because I have diabetes.”',
      '“I need regular exercise, healthy meals, and routine follow-up even when I feel well.”',
      '“I will take my medication only when my sugar feels high.”'
    ],
    answer: 2,
    rationale: 'Health promotion focuses on consistent self-management, not symptom-based treatment. Regular exercise, appropriate nutrition, and routine follow-up help reduce long-term complications. The incorrect options reflect misconceptions about diabetes self-care.',
    distractors: [
      'Blood sugar monitoring should not be stopped just because symptoms improve.',
      'Fruit is not automatically prohibited; teaching should focus on balanced meal planning.',
      'Medication should not be based only on how the client feels.'
    ]
  },
  {
    id: 5,
    domain: 'Nursing Leadership and Management',
    topic: 'Delegation',
    stem: 'A registered nurse is caring for four clients on a medical unit. One stable client requires assistance with bathing, reinforcement of diet teaching, and assessment of a newly reported headache. Which task is most appropriate for the nurse to delegate to the nursing assistant?',
    options: [
      'Assessing the new headache.',
      'Reinforcing the low-sodium diet plan.',
      'Assisting the stable client with bathing.',
      'Evaluating the client’s understanding of medication adherence.'
    ],
    answer: 2,
    rationale: 'Assisting with bathing is within the role of the nursing assistant. Assessment, evaluation, and teaching remain the responsibility of the registered nurse. Safe delegation depends on client stability, task predictability, and staff role boundaries.',
    distractors: [
      'Assessment remains the nurse’s responsibility.',
      'Reinforcement of teaching is not the safest delegated choice in this group.',
      'Evaluation is the nurse’s responsibility.'
    ]
  }
];

const mockQuestions = [
  {
    id: 101,
    domain: 'Clinical Decision Making and Intervention',
    topic: 'Hypoglycaemia',
    stem: 'A client with type 2 diabetes mellitus and hypertension suddenly becomes diaphoretic, shaky, and confused while waiting for breakfast. Which action should the nurse take first?',
    options: [
      'Recheck the blood pressure in both arms.',
      'Ask when the client last took the antihypertensive medication.',
      'Give a fast-acting carbohydrate if the client can swallow safely.',
      'Teach the client the signs of hypoglycaemia.'
    ],
    answer: 2
  },
  {
    id: 102,
    domain: 'Nursing Practice',
    topic: 'Post-Dialysis Assessment',
    stem: 'A client returns to the unit after hemodialysis and becomes restless, confused, and nauseated within the first hour. Which nursing action is most appropriate during the initial assessment?',
    options: [
      'Obtain a neurological assessment and report the findings promptly.',
      'Encourage oral fluids and provide reassurance.',
      'Ask the client to rest quietly and reassess later.',
      'Document the findings as expected post-dialysis changes.'
    ],
    answer: 0
  },
  {
    id: 103,
    domain: 'Communication',
    topic: 'Client Support',
    stem: 'A client says, “I do not think I can handle all these lifestyle changes.” Which response by the nurse is most therapeutic?',
    options: [
      '“You must try harder or your illness will get worse.”',
      '“Tell me which part feels hardest for you right now.”',
      '“Many people have this problem, so you will get used to it.”',
      '“Just follow the instructions and everything will be fine.”'
    ],
    answer: 1
  },
  {
    id: 104,
    domain: 'Professional Conduct',
    topic: 'Confidentiality',
    stem: 'A client asks the nurse not to discuss the diagnosis with relatives. Later, the client’s sister asks, “What is wrong with him?” Which response is best?',
    options: [
      '“He is stable right now, but he is ill.”',
      '“I cannot discuss his condition without his permission.”',
      '“You should ask the doctor about that.”',
      '“He will explain later.”'
    ],
    answer: 1
  },
  {
    id: 105,
    domain: 'Professional Development',
    topic: 'Benner Theory',
    stem: 'A nurse with 5 years of medical-surgical experience is transferred to ICU for the first time. Based on Patricia Benner’s theory, which level best describes the nurse in the ICU setting?',
    options: ['Expert', 'Proficient', 'Competent', 'Advanced beginner'],
    answer: 3
  }
];

function LogoMark({ compact = false }) {
  return (
    <div className={`rounded-2xl border border-violet-200 bg-white/95 text-violet-800 shadow-sm ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className={`${compact ? 'text-2xl' : 'text-3xl'} font-black leading-none tracking-tight`}>NRG</div>
      <div className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 font-medium tracking-wide`}>Nursing Review Examination Guide</div>
    </div>
  );
}

function formatTime(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function speakText(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function getBand(score) {
  if (score < 30) return 'Low fatigue pattern';
  if (score < 60) return 'Moderate fatigue pattern';
  return 'High fatigue pattern';
}

function computeFatigueSummary(submissions, questions) {
  const baseline = submissions.slice(0, Math.min(2, submissions.length));
  const late = submissions.slice(Math.max(submissions.length - 2, 0));
  const baselineAccuracy = baseline.length ? baseline.filter((s) => s.correct).length / baseline.length : 1;
  const lateAccuracy = late.length ? late.filter((s) => s.correct).length / late.length : 1;
  const baselineTime = baseline.length ? baseline.reduce((sum, s) => sum + s.timeSpent, 0) / baseline.length : 45;
  const lateTime = late.length ? late.reduce((sum, s) => sum + s.timeSpent, 0) / late.length : 45;
  const fastWrongCount = submissions.filter((s) => !s.correct && s.timeSpent < 20).length;
  let score = Math.round(Math.max(0, baselineAccuracy - lateAccuracy) * 55);
  if (lateTime > baselineTime * 1.25) score += 18;
  if (fastWrongCount > 0 || (lateTime < baselineTime * 0.7 && lateAccuracy < baselineAccuracy)) score += 20;
  score += Math.min(20, fastWrongCount * 10);
  score = Math.max(0, Math.min(100, score));

  const domainMap = {};
  questions.forEach((q) => {
    domainMap[q.domain] = { correct: 0, total: 0 };
  });
  submissions.forEach((s, index) => {
    const q = questions[index];
    if (!q) return;
    domainMap[q.domain].total += 1;
    if (s.correct) domainMap[q.domain].correct += 1;
  });

  return {
    score,
    band: getBand(score),
    declinePoint: submissions.length >= 4 ? 'Q41–60 (sample preview)' : 'Mid-exam',
    baselineAccuracy: Math.round(baselineAccuracy * 100),
    lateAccuracy: Math.round(lateAccuracy * 100),
    baselineTime: Math.round(baselineTime),
    lateTime: Math.round(lateTime),
    domainSummary: Object.entries(domainMap).map(([domain, values]) => ({
      domain,
      score: values.total ? Math.round((values.correct / values.total) * 100) : 0
    })),
    flaggedCount: submissions.filter((s) => s.flagged).length,
    breakCount: submissions.filter((s) => s.usedBreakBeforeSubmit).length
  };
}

function LandingScreen({ onStudent, onAdmin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-6 text-slate-800 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-xl">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr,0.8fr] lg:p-10">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <LogoMark />
                <Badge className="bg-violet-700 text-white hover:bg-violet-700">Soft Launch Beta</Badge>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 md:text-5xl">RENR-first preparation with structure, stamina, and clarity.</h1>
              <p className="text-lg leading-8 text-slate-700">
                NRG helps students prepare through structured domain-based practice, one-paper mock exams, strong rationales, and feedback on both performance and focus.
              </p>
              <div className="rounded-3xl bg-violet-50 p-5">
                <div className="text-sm font-semibold uppercase tracking-wide text-violet-800">Daily encouragement</div>
                <p className="mt-2 text-lg leading-8 text-slate-800">“I attribute my success to this: I never gave or took any excuse.”</p>
                <p className="mt-2 text-sm text-violet-700">— Florence Nightingale</p>
              </div>
              <div className="rounded-3xl border border-violet-100 bg-white p-5">
                <div className="font-semibold text-slate-900">Further updates and review class information</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">Students can check the NRG Instagram page for review-class updates and soft-launch announcements.</p>
                <a href="https://www.instagram.com/nrg_868?igsh=MWQzZXBwN3F0eXZraw%3D%3D" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-violet-700 underline underline-offset-4">
                  Visit @nrg_868
                </a>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={onStudent} className="h-12 rounded-2xl bg-violet-700 px-6 hover:bg-violet-800">Student Entry</Button>
                <Button onClick={onAdmin} variant="outline" className="h-12 rounded-2xl border-violet-200 text-violet-700 hover:bg-violet-50">Admin Entry</Button>
              </div>
            </div>
            <div className="space-y-4">
              <Card className="rounded-3xl border-violet-100 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">7 RENR Domains Introduction</CardTitle>
                  <CardDescription>Tap audio to hear the explanation of each domain.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {domainIntro.map((domain) => (
                    <div key={domain.code} className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-violet-900">{domain.code} — {domain.title}</div>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{domain.summary}</p>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-xl border-violet-200 text-violet-700 hover:bg-white" onClick={() => speakText(`${domain.title}. ${domain.summary}`)}>
                          <Headphones className="mr-2 h-4 w-4" /> Audio
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentGate({ onEnter }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [examMonth, setExamMonth] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem(studentProfileKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      setName(parsed.name || '');
      setEmail(parsed.email || '');
      setExamMonth(parsed.examMonth || '');
    }
  }, []);

  const submit = () => {
    if (!name || !email || !examMonth) return;
    const profile = { name, email, examMonth };
    window.localStorage.setItem(studentProfileKey, JSON.stringify(profile));
    onEnter(profile);
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex justify-center"><LogoMark /></div>
      <Card className="rounded-3xl border-violet-100 shadow-sm">
        <CardHeader>
          <CardTitle>Create Student Account</CardTitle>
          <CardDescription>Name, email, and exam month will allow students to return to the same account later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Exam month</Label>
            <Select value={examMonth} onValueChange={setExamMonth}>
              <SelectTrigger><SelectValue placeholder="Select exam month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="April">April</SelectItem>
                <SelectItem value="October">October</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} className="h-12 w-full rounded-2xl bg-violet-700 hover:bg-violet-800">Enter Student Portal</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminGate({ onEnter }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (email === 'Jadenicome1@gmail' || (email && password === 'nrgadmin')) {
      onEnter();
      return;
    }
    setError('Use the recognized admin email or the admin password gate.');
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex justify-center"><LogoMark /></div>
      <Card className="rounded-3xl border-violet-100 shadow-sm">
        <CardHeader>
          <CardTitle>Admin Access</CardTitle>
          <CardDescription>The recognized admin email bypasses the password gate. All other admin entries require the admin password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <Button onClick={submit} className="h-12 w-full rounded-2xl bg-violet-700 hover:bg-violet-800">Enter Admin Portal</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionBankPanel() {
  const [selectedId, setSelectedId] = useState(bankQuestions[0].id);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const active = bankQuestions.find((q) => q.id === selectedId) || bankQuestions[0];

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[320px,1fr]">
      <Card className="rounded-3xl border-violet-100 shadow-sm">
        <CardHeader>
          <CardTitle>Question Bank</CardTitle>
          <CardDescription>Soft launch beta view grouped by RENR domain internally, but hidden from students during answering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bankQuestions.map((q, idx) => (
            <button key={q.id} onClick={() => { setSelectedId(q.id); setSelectedAnswer(null); setShowReview(false); }} className={`w-full rounded-2xl border p-4 text-left transition ${active.id === q.id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/50'}`}>
              <div className="text-sm font-semibold text-slate-900">Question {idx + 1}</div>
              <div className="mt-2 line-clamp-3 text-sm leading-6 text-slate-700">{q.stem}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-violet-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Question Bank Practice</CardTitle>
          <CardDescription>Domain and topic stay hidden while the student answers. They appear only in review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="rounded-2xl bg-violet-50 p-5 text-lg leading-8 text-slate-900">{active.stem}</div>
          <div className="space-y-3">
            {active.options.map((option, idx) => (
              <button key={idx} onClick={() => !showReview && setSelectedAnswer(idx)} className={`w-full rounded-2xl border px-5 py-4 text-left transition ${selectedAnswer === idx ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/50'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selectedAnswer === idx ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-700'}`}>{String.fromCharCode(65 + idx)}</div>
                  <div className="leading-7">{option}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setShowReview(true)} disabled={selectedAnswer === null || showReview} className="rounded-2xl bg-violet-700 hover:bg-violet-800">Check Answer</Button>
            <Button variant="outline" onClick={() => { setSelectedAnswer(null); setShowReview(false); }} className="rounded-2xl border-violet-200 text-violet-700 hover:bg-violet-50">Reset</Button>
          </div>
          {showReview && (
            <div className="space-y-4 rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-700 hover:bg-violet-700">{active.domain}</Badge>
                <Badge className="bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100">{active.topic}</Badge>
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-900"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Correct Answer: {String.fromCharCode(65 + active.answer)}</div>
              <div className="rounded-2xl bg-emerald-50 p-4"><div className="font-semibold text-emerald-900">Why this answer is right</div><p className="mt-2 leading-7 text-slate-700">{active.rationale}</p></div>
              <div className="rounded-2xl bg-amber-50 p-4"><div className="font-semibold text-amber-900">Why the other options are wrong</div><ul className="mt-2 space-y-2 text-slate-700">{active.distractors.map((item, idx) => <li key={idx}>• {item}</li>)}</ul></div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function MockExamPanel() {
  const [examState, setExamState] = useState('landing');
  const [countdown, setCountdown] = useState(5);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(2 * 60 * 60 + 30 * 60);
  const [questionStart, setQuestionStart] = useState(Date.now());
  const [breakOverlay, setBreakOverlay] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [usedBreakThisQuestion, setUsedBreakThisQuestion] = useState(false);

  useEffect(() => {
    if (examState !== 'countdown') return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setExamState('running');
          setQuestionStart(Date.now());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examState]);

  useEffect(() => {
    if (examState !== 'running') return;
    const timer = setInterval(() => setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [examState]);

  const startExam = () => {
    setExamState('countdown');
    setCountdown(5);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setSubmissions([]);
    setSecondsLeft(2 * 60 * 60 + 30 * 60);
    setBreakOverlay(false);
    setFlagged(false);
    setUsedBreakThisQuestion(false);
  };

  const currentQuestion = mockQuestions[currentIndex];

  const submitCurrentQuestion = () => {
    if (selectedAnswer === null) return;
    const timeSpent = Math.max(5, Math.round((Date.now() - questionStart) / 1000));
    const next = [...submissions, {
      questionId: currentQuestion.id,
      selectedAnswer,
      correct: selectedAnswer === currentQuestion.answer,
      timeSpent,
      flagged,
      usedBreakBeforeSubmit: usedBreakThisQuestion
    }];
    setSubmissions(next);
    setSelectedAnswer(null);
    setFlagged(false);
    setBreakOverlay(false);
    setUsedBreakThisQuestion(false);
    if (currentIndex === mockQuestions.length - 1) {
      setExamState('complete');
    } else {
      setCurrentIndex((prev) => prev + 1);
      setQuestionStart(Date.now());
    }
  };

  const result = computeFatigueSummary(submissions, mockQuestions);
  const score = submissions.length ? Math.round((submissions.filter((s) => s.correct).length / submissions.length) * 100) : 0;

  if (examState === 'landing') {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {examPreviewCards.map((card) => (
            <Card key={card.title} className="rounded-3xl border-violet-100 shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between"><div className="text-lg font-bold text-slate-900">{card.title}</div><Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">{card.badge}</Badge></div>
                <div className="text-sm font-medium text-violet-700">{card.schedule}</div>
                <div className="text-sm leading-6 text-slate-700">{card.detail}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-3xl border-violet-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">One-Paper Mock Exam</CardTitle>
            <CardDescription>Students see domain results and an Exam Stamina Score after submission. Full rationales release on Tuesday from the same student account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-violet-50 p-4">One-way question flow with no return.</div>
              <div className="rounded-2xl bg-violet-50 p-4">Break button available, but exam time continues to run.</div>
              <div className="rounded-2xl bg-violet-50 p-4">40-question review set will later be chosen from missed, flagged, and high-time items.</div>
              <div className="rounded-2xl bg-violet-50 p-4">Full rationale review remains locked until the scheduled release stage.</div>
            </div>
            <Button onClick={startExam} className="h-12 rounded-2xl bg-violet-700 px-6 hover:bg-violet-800">Start Mock Exam</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (examState === 'countdown') {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-violet-200 bg-gradient-to-br from-[#f7f0ff] via-[#fffdf8] to-[#efe7ff] p-8 shadow-xl md:p-12">
        <div className="relative mx-auto max-w-4xl space-y-8 text-center">
          <div className="flex justify-center"><LogoMark /></div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-violet-800 shadow-sm"><Stethoscope className="h-4 w-4" /> Quiet med-surg exam mode loading</div>
          <div className="space-y-3">
            <h3 className="text-3xl font-black text-slate-900 md:text-4xl">Mock exam starting</h3>
            <p className="mx-auto max-w-2xl text-base leading-8 text-slate-700 md:text-lg">Settle into a calm, distraction-free mindset. Treat this like the real exam room: no phone, no noise, no multitasking.</p>
          </div>
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-white/85 shadow-lg ring-8 ring-violet-100"><span className="text-6xl font-black text-violet-700">{countdown}</span></div>
        </div>
      </div>
    );
  }

  if (examState === 'complete') {
    return (
      <div className="space-y-6">
        <Card className="rounded-3xl border-violet-100 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Post-Exam Summary</CardTitle>
            <CardDescription>Immediate domain results and stamina feedback. Detailed rationales release Tuesday from this same account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-violet-50 p-4"><div className="text-sm text-slate-500">Mock score</div><div className="mt-2 text-3xl font-bold text-slate-900">{score}%</div></div>
            <div className="rounded-2xl bg-violet-50 p-4"><div className="text-sm text-slate-500">Exam Stamina Score</div><div className="mt-2 text-3xl font-bold text-slate-900">{result.score}/100</div><div className="mt-1 text-sm text-violet-700">{result.band}</div></div>
            <div className="rounded-2xl bg-violet-50 p-4"><div className="text-sm text-slate-500">Likely decline point</div><div className="mt-2 text-xl font-bold text-slate-900">{result.declinePoint}</div></div>
            <div className="rounded-2xl bg-violet-50 p-4"><div className="text-sm text-slate-500">Rationale release</div><div className="mt-2 text-xl font-bold text-slate-900">Tuesday</div><div className="mt-1 text-sm text-violet-700">From this same student login</div></div>
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <Card className="rounded-3xl border-violet-100 shadow-sm">
            <CardHeader><CardTitle className="text-xl">Domain Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {result.domainSummary.map((item) => (
                <div key={item.domain}><div className="mb-2 flex items-center justify-between text-sm"><span>{item.domain}</span><span className="font-semibold">{item.score}%</span></div><Progress value={item.score} className="h-3" /></div>
              ))}
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-violet-100 shadow-sm">
            <CardHeader><CardTitle className="text-xl">Student Focus Feedback</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-700">
              <div className="rounded-2xl bg-emerald-50 p-4">Baseline accuracy was {result.baselineAccuracy}%, while later-question accuracy was {result.lateAccuracy}%.</div>
              <div className="rounded-2xl bg-amber-50 p-4">Pacing shifted from about {result.baselineTime}s to {result.lateTime}s per question in the later section.</div>
              <div className="rounded-2xl bg-violet-50 p-4">Use this result to build self-awareness for the paper-based RENR exam.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-violet-200 bg-gradient-to-br from-violet-50 via-[#fffdfa] to-fuchsia-50 shadow-xl">
      <div className="relative p-4 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-2xl border-violet-300 bg-white/90 text-violet-700 hover:bg-violet-50" onClick={() => { setBreakOverlay(true); setUsedBreakThisQuestion(true); }}><TimerReset className="mr-2 h-4 w-4" /> Break</Button>
            <div className="rounded-2xl bg-white/85 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm">Time Left: {formatTime(secondsLeft)}</div>
          </div>
          <LogoMark compact />
          <Button variant="outline" className={`rounded-2xl border-violet-300 bg-white/90 ${flagged ? 'bg-violet-100 text-violet-900' : 'text-violet-700 hover:bg-violet-50'}`} onClick={() => setFlagged((prev) => !prev)}><Flag className="mr-2 h-4 w-4" /> {flagged ? 'Flagged' : 'Flag'}</Button>
        </div>
        {breakOverlay && <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50/95 p-5 shadow-sm"><div className="font-semibold text-amber-900">Break Reminder</div><p className="mt-1 text-sm leading-6 text-slate-700">This break does not pause your exam time. Use breaks only for a genuine short reset so your mock remains close to real exam conditions.</p><Button onClick={() => setBreakOverlay(false)} className="mt-4 rounded-2xl bg-amber-600 hover:bg-amber-700">Return to Exam</Button></div>}
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-violet-700 hover:bg-violet-700">Soft Launch Beta</Badge>
            <Badge className="bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100">Quiet med/surg ward mode</Badge>
            <Badge variant="outline" className="border-violet-200 bg-white/80 text-violet-700">Question {currentIndex + 1} / {mockQuestions.length}</Badge>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr),220px]">
            <div className="rounded-[2rem] border border-violet-100 bg-white/95 p-6 shadow-lg md:p-10">
              <div className="mb-8 text-[1.1rem] font-medium leading-9 text-slate-900 md:text-[1.25rem]">{currentQuestion.stem}</div>
              <div className="space-y-4">
                {currentQuestion.options.map((option, idx) => (
                  <button key={idx} onClick={() => setSelectedAnswer(idx)} className={`w-full rounded-2xl border px-5 py-4 text-left transition ${selectedAnswer === idx ? 'border-violet-400 bg-violet-50 shadow-sm' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50'}`}>
                    <div className="flex items-start gap-4"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selectedAnswer === idx ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-700'}`}>{String.fromCharCode(65 + idx)}</div><div className="leading-8 text-slate-800">{option}</div></div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-start"><Button onClick={submitCurrentQuestion} disabled={selectedAnswer === null} className="h-12 min-w-[190px] rounded-2xl bg-violet-700 hover:bg-violet-800">{currentIndex === mockQuestions.length - 1 ? 'Submit Mock' : 'Next Question'}</Button></div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-violet-100 bg-white/85 p-4 shadow-sm"><div className="text-sm font-semibold text-violet-900">Exam notes</div><p className="mt-2 text-sm leading-6 text-slate-700">Domains stay hidden during the exam. They appear later in results and rationale review.</p></div>
              <div className="rounded-3xl border border-violet-100 bg-white/85 p-4 shadow-sm"><div className="text-sm font-semibold text-violet-900">Question tools</div><p className="mt-2 text-sm leading-6 text-slate-700">Break is top left. Flag is top right. Next question sits directly below the options.</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentPortal({ profile, onBack }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col justify-between border-r border-violet-100 bg-white/80 p-5 backdrop-blur-sm lg:flex">
          <div>
            <div className="mb-8 rounded-3xl bg-violet-700 p-5 text-white shadow-lg shadow-violet-200">
              <div className="text-3xl font-black tracking-tight">NRG</div>
              <div className="mt-1 text-sm text-violet-100">Student Portal</div>
              <div className="mt-4 rounded-2xl bg-white/15 p-3 text-sm leading-6">Soft Launch Beta • Welcome {profile?.name || 'Student'}</div>
            </div>
            <nav className="space-y-2">
              {studentNav.map(({ label, icon: Icon }) => <button key={label} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${label === 'Mock Exams' ? 'bg-violet-100 font-semibold text-violet-900' : 'text-slate-700 ho