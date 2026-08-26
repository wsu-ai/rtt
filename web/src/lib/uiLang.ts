// 랜딩 페이지(Home) UI 문구 다국어. 강의 자막 번역(languages.ts)과는 별개 — 이건 화면 자체의 언어.
export type UiLang = 'ko' | 'en' | 'bn' | 'zh'

export const UI_LANGUAGES: { code: UiLang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'zh', label: '中文' },
]

export type UiDict = {
  languageSelectLabel: string
  subStudent: string
  subInstructor: string
  roleStudent: string
  roleInstructor: string
  roleInstructorLockedTitle: string
  fieldCode: string
  codePlaceholder: string
  fieldPassword: string
  studentPasswordPlaceholder: string
  fieldOutputLang: string
  join: string
  joining: string
  fieldTitle: string
  titlePlaceholder: string
  fieldRoomCode: string
  roomCodePlaceholder: string
  instructorPasswordPlaceholder: string
  create: string
  creating: string
  errServerNotSet: string
  errWrongCode: string
  errRoomTaken: string
  errCreateFail: string
  errNoGeminiServer: string
  hintNoGeminiKey: string
  hintNoSupabasePre: string
  hintNoSupabasePost: string
  footer: string
  lockTitle: string
  lockDesc: string
  passcodePlaceholder: string
  cancel: string
  confirm: string
  keyTitle: string
  keyDescPre: string
  keyDescBold: string
  keyDescPost: string
  keyPlaceholder: string
  show: string
  hide: string
  keyCurrentPre: string
  keyCurrentMine: string
  keyCurrentDefault: string
  keyCurrentPost: string
  resetDefault: string
  save: string
  keyBtnAriaMine: string
  keyBtnTitleMine: string
  keyBtnTitleDefault: string
  lockBtnAriaOn: string
  lockBtnAriaOff: string
  lockBtnTitleOn: string
  lockBtnTitleOff: string
}

export const UI_DICTS: Record<UiLang, UiDict> = {
  ko: {
    languageSelectLabel: '화면 언어',
    subStudent: '입장 코드로 들어가 원하는 언어로 자막을 받으세요.',
    subInstructor: '강의 방을 만들고 학생에게 코드를 공유하세요.',
    roleStudent: '강의 입장',
    roleInstructor: '강의 개설',
    roleInstructorLockedTitle: '교수자 전용 — 우측 상단 자물쇠로 잠금 해제',
    fieldCode: '입장 코드',
    codePlaceholder: '예: 4821',
    fieldPassword: '비밀번호',
    studentPasswordPlaceholder: '강의 비밀번호',
    fieldOutputLang: '출력 언어',
    join: '입장',
    joining: '확인 중…',
    fieldTitle: '강의명',
    titlePlaceholder: '예: 한국 문화의 이해',
    fieldRoomCode: '방 코드',
    roomCodePlaceholder: '예: 4821',
    instructorPasswordPlaceholder: '방 비밀번호',
    create: '개설',
    creating: '개설 중…',
    errServerNotSet: '서버 설정(Supabase)이 아직 없습니다. .env.local에 키를 넣어주세요.',
    errWrongCode: '방 코드 또는 비밀번호가 올바르지 않습니다.',
    errRoomTaken: '이미 사용 중인 방 코드입니다. 다른 코드를 쓰세요.',
    errCreateFail: '방 생성에 실패했습니다. 서버 설정을 확인하세요.',
    errNoGeminiServer: '서버에 Gemini 키가 설정되어 있지 않습니다.',
    hintNoGeminiKey: '⚠ 서버에 Gemini 키가 설정되어 있지 않습니다. 관리자에게 문의하세요.',
    hintNoSupabasePre: '⚠ 서버(Supabase) 설정이 아직 없습니다. ',
    hintNoSupabasePost: '에 URL/anon 키를 넣어주세요.',
    footer: 'WSU Live Translation',
    lockTitle: '🔒 교수자 비밀번호',
    lockDesc: '교수자만 강의를 개설할 수 있습니다.',
    passcodePlaceholder: '비밀번호',
    cancel: '취소',
    confirm: '확인',
    keyTitle: '🔑 Gemini API 키',
    keyDescPre: '안정적 운영을 위해 본인 키를 넣을 수 있어요. 비우면 기본 키를 씁니다. ',
    keyDescBold: '이 브라우저에만',
    keyDescPost: ' 저장됩니다.',
    keyPlaceholder: 'AIza…',
    show: '보기',
    hide: '숨기기',
    keyCurrentPre: '현재: ',
    keyCurrentMine: '내 키',
    keyCurrentDefault: '기본 키',
    keyCurrentPost: ' 사용 중',
    resetDefault: '기본값',
    save: '저장',
    keyBtnAriaMine: 'Gemini API 키',
    keyBtnTitleMine: 'Gemini 키 — 내 키 사용 중',
    keyBtnTitleDefault: 'Gemini 키 — 기본 키 사용 중',
    lockBtnAriaOn: '교수자 모드 — 누르면 잠금',
    lockBtnAriaOff: '교수자 비밀번호 입력',
    lockBtnTitleOn: '교수자 모드 켜짐 — 누르면 잠금',
    lockBtnTitleOff: '교수자 비밀번호',
  },
  en: {
    languageSelectLabel: 'Display Language',
    subStudent: 'Enter your access code and get subtitles in your language.',
    subInstructor: 'Create a lecture room and share the code with students.',
    roleStudent: 'Join Lecture',
    roleInstructor: 'Create Lecture',
    roleInstructorLockedTitle: 'Instructor only — unlock with the lock icon in the top right',
    fieldCode: 'Access Code',
    codePlaceholder: 'e.g. 4821',
    fieldPassword: 'Password',
    studentPasswordPlaceholder: 'Lecture password',
    fieldOutputLang: 'Output Language',
    join: 'Join',
    joining: 'Checking…',
    fieldTitle: 'Lecture Title',
    titlePlaceholder: 'e.g. Understanding Korean Culture',
    fieldRoomCode: 'Room Code',
    roomCodePlaceholder: 'e.g. 4821',
    instructorPasswordPlaceholder: 'Room password',
    create: 'Create',
    creating: 'Creating…',
    errServerNotSet: 'Server (Supabase) is not configured yet. Add your keys to .env.local.',
    errWrongCode: 'The room code or password is incorrect.',
    errRoomTaken: 'That room code is already in use. Please choose another.',
    errCreateFail: 'Failed to create the room. Please check the server configuration.',
    errNoGeminiServer: 'No Gemini key is configured on the server.',
    hintNoGeminiKey: '⚠ No Gemini key is configured on the server. Please contact the administrator.',
    hintNoSupabasePre: '⚠ Server (Supabase) is not configured yet. Add your URL/anon key to ',
    hintNoSupabasePost: '.',
    footer: 'WSU Live Translation',
    lockTitle: '🔒 Instructor Password',
    lockDesc: 'Only instructors can create a lecture.',
    passcodePlaceholder: 'Password',
    cancel: 'Cancel',
    confirm: 'Confirm',
    keyTitle: '🔑 Gemini API Key',
    keyDescPre: 'For more stable service, you can use your own key. Leave blank to use the default key. Stored ',
    keyDescBold: 'only in this browser',
    keyDescPost: '.',
    keyPlaceholder: 'AIza…',
    show: 'Show',
    hide: 'Hide',
    keyCurrentPre: 'Currently using: ',
    keyCurrentMine: 'my key',
    keyCurrentDefault: 'default key',
    keyCurrentPost: '',
    resetDefault: 'Default',
    save: 'Save',
    keyBtnAriaMine: 'Gemini API key',
    keyBtnTitleMine: 'Gemini key — using my key',
    keyBtnTitleDefault: 'Gemini key — using default key',
    lockBtnAriaOn: 'Instructor mode — click to lock',
    lockBtnAriaOff: 'Enter instructor password',
    lockBtnTitleOn: 'Instructor mode on — click to lock',
    lockBtnTitleOff: 'Instructor password',
  },
  bn: {
    languageSelectLabel: 'পর্দার ভাষা',
    subStudent: 'প্রবেশ কোড দিয়ে ঢুকুন এবং আপনার পছন্দের ভাষায় সাবটাইটেল পান।',
    subInstructor: 'একটি লেকচার রুম তৈরি করুন এবং কোডটি শিক্ষার্থীদের সাথে শেয়ার করুন।',
    roleStudent: 'লেকচারে প্রবেশ',
    roleInstructor: 'লেকচার তৈরি করুন',
    roleInstructorLockedTitle: 'শুধু শিক্ষকদের জন্য — ওপরে ডানদিকের লক আইকনে আনলক করুন',
    fieldCode: 'প্রবেশ কোড',
    codePlaceholder: 'উদাহরণ: 4821',
    fieldPassword: 'পাসওয়ার্ড',
    studentPasswordPlaceholder: 'লেকচার পাসওয়ার্ড',
    fieldOutputLang: 'আউটপুট ভাষা',
    join: 'প্রবেশ করুন',
    joining: 'যাচাই করা হচ্ছে…',
    fieldTitle: 'লেকচারের শিরোনাম',
    titlePlaceholder: 'উদাহরণ: কোরিয়ান সংস্কৃতি বোঝা',
    fieldRoomCode: 'রুম কোড',
    roomCodePlaceholder: 'উদাহরণ: 4821',
    instructorPasswordPlaceholder: 'রুম পাসওয়ার্ড',
    create: 'তৈরি করুন',
    creating: 'তৈরি করা হচ্ছে…',
    errServerNotSet: 'সার্ভার (Supabase) এখনও কনফিগার করা হয়নি। .env.local ফাইলে আপনার কী যোগ করুন।',
    errWrongCode: 'রুম কোড বা পাসওয়ার্ড সঠিক নয়।',
    errRoomTaken: 'এই রুম কোডটি ইতিমধ্যে ব্যবহৃত হচ্ছে। অন্য একটি কোড ব্যবহার করুন।',
    errCreateFail: 'রুম তৈরি করা যায়নি। সার্ভার কনফিগারেশন পরীক্ষা করুন।',
    errNoGeminiServer: 'সার্ভারে কোনো Gemini কী কনফিগার করা নেই।',
    hintNoGeminiKey: '⚠ সার্ভারে কোনো Gemini কী কনফিগার করা নেই। অনুগ্রহ করে প্রশাসকের সাথে যোগাযোগ করুন।',
    hintNoSupabasePre: '⚠ সার্ভার (Supabase) এখনও কনফিগার করা হয়নি। আপনার URL/anon কী যোগ করুন ',
    hintNoSupabasePost: ' এখানে।',
    footer: 'WSU Live Translation',
    lockTitle: '🔒 শিক্ষকের পাসওয়ার্ড',
    lockDesc: 'শুধু শিক্ষকরাই লেকচার তৈরি করতে পারেন।',
    passcodePlaceholder: 'পাসওয়ার্ড',
    cancel: 'বাতিল',
    confirm: 'নিশ্চিত করুন',
    keyTitle: '🔑 Gemini API কী',
    keyDescPre: 'আরও স্থিতিশীল পরিষেবার জন্য আপনি নিজের কী ব্যবহার করতে পারেন। খালি রাখলে ডিফল্ট কী ব্যবহৃত হবে। এটি ',
    keyDescBold: 'শুধু এই ব্রাউজারে',
    keyDescPost: ' সংরক্ষিত হয়।',
    keyPlaceholder: 'AIza…',
    show: 'দেখান',
    hide: 'লুকান',
    keyCurrentPre: 'বর্তমানে ব্যবহৃত হচ্ছে: ',
    keyCurrentMine: 'আমার কী',
    keyCurrentDefault: 'ডিফল্ট কী',
    keyCurrentPost: '',
    resetDefault: 'ডিফল্ট',
    save: 'সংরক্ষণ করুন',
    keyBtnAriaMine: 'Gemini API কী',
    keyBtnTitleMine: 'Gemini কী — আমার কী ব্যবহৃত হচ্ছে',
    keyBtnTitleDefault: 'Gemini কী — ডিফল্ট কী ব্যবহৃত হচ্ছে',
    lockBtnAriaOn: 'শিক্ষক মোড — লক করতে চাপুন',
    lockBtnAriaOff: 'শিক্ষকের পাসওয়ার্ড লিখুন',
    lockBtnTitleOn: 'শিক্ষক মোড চালু — লক করতে চাপুন',
    lockBtnTitleOff: 'শিক্ষকের পাসওয়ার্ড',
  },
  zh: {
    languageSelectLabel: '显示语言',
    subStudent: '输入访问码进入,以您选择的语言接收字幕。',
    subInstructor: '创建讲座房间并与学生分享代码。',
    roleStudent: '进入讲座',
    roleInstructor: '创建讲座',
    roleInstructorLockedTitle: '仅限教师 — 点击右上角的锁图标解锁',
    fieldCode: '访问码',
    codePlaceholder: '例如: 4821',
    fieldPassword: '密码',
    studentPasswordPlaceholder: '讲座密码',
    fieldOutputLang: '输出语言',
    join: '进入',
    joining: '正在确认…',
    fieldTitle: '讲座标题',
    titlePlaceholder: '例如: 理解韩国文化',
    fieldRoomCode: '房间代码',
    roomCodePlaceholder: '例如: 4821',
    instructorPasswordPlaceholder: '房间密码',
    create: '创建',
    creating: '正在创建…',
    errServerNotSet: '服务器(Supabase)尚未配置。请在 .env.local 中添加您的密钥。',
    errWrongCode: '房间代码或密码不正确。',
    errRoomTaken: '该房间代码已被使用。请选择其他代码。',
    errCreateFail: '创建房间失败。请检查服务器配置。',
    errNoGeminiServer: '服务器上未配置 Gemini 密钥。',
    hintNoGeminiKey: '⚠ 服务器上未配置 Gemini 密钥。请联系管理员。',
    hintNoSupabasePre: '⚠ 服务器(Supabase)尚未配置。请在 ',
    hintNoSupabasePost: ' 中添加您的 URL/anon 密钥。',
    footer: 'WSU Live Translation',
    lockTitle: '🔒 教师密码',
    lockDesc: '只有教师才能创建讲座。',
    passcodePlaceholder: '密码',
    cancel: '取消',
    confirm: '确认',
    keyTitle: '🔑 Gemini API 密钥',
    keyDescPre: '为了更稳定的服务,您可以使用自己的密钥。留空则使用默认密钥。仅',
    keyDescBold: '保存在此浏览器中',
    keyDescPost: '。',
    keyPlaceholder: 'AIza…',
    show: '显示',
    hide: '隐藏',
    keyCurrentPre: '当前使用: ',
    keyCurrentMine: '我的密钥',
    keyCurrentDefault: '默认密钥',
    keyCurrentPost: '',
    resetDefault: '默认值',
    save: '保存',
    keyBtnAriaMine: 'Gemini API 密钥',
    keyBtnTitleMine: 'Gemini 密钥 — 使用我的密钥',
    keyBtnTitleDefault: 'Gemini 密钥 — 使用默认密钥',
    lockBtnAriaOn: '教师模式 — 点击锁定',
    lockBtnAriaOff: '输入教师密码',
    lockBtnTitleOn: '教师模式已开启 — 点击锁定',
    lockBtnTitleOff: '教师密码',
  },
}

const UI_LANG_STORE = 'ltx.uiLang'
export function getStoredUiLang(): UiLang {
  try {
    const v = localStorage.getItem(UI_LANG_STORE)
    if (v === 'ko' || v === 'en' || v === 'bn' || v === 'zh') return v
  } catch { /* noop */ }
  return 'en'
}
export function setStoredUiLang(lang: UiLang): void {
  try { localStorage.setItem(UI_LANG_STORE, lang) } catch { /* noop */ }
}
