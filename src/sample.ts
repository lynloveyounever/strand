import { initialTimelines, type Timelines } from "./temporal";
import { blankStages, type Project, type Snapshot, type Unit } from "./model";
const snap = (
  state: string,
  knowledge: string,
  goal: string,
  obstacle: string,
  motivation: string,
): Snapshot => ({ state, knowledge, goal, obstacle, motivation });
const lin0 = snap(
  "信任",
  "哥哥阿澤答應今晚回港",
  "帶哥哥安全離港",
  "港口因失竊而封鎖",
  "守住最後的家人",
);
const ze0 = snap(
  "隱瞞",
  "船運公司偷排廢料；證據藏在錄音機",
  "把證據送出港",
  "公司控制巡邏隊",
  "補償自己曾經的沉默",
);
const aud0 = snap(
  "好奇",
  "霧港停電，一艘船仍亮著燈",
  "理解誰在說謊",
  "資訊被遮蔽",
  "追查消失的貨櫃",
);
const events = [
  [
    "燈還亮著",
    "封港後，阿澤藏在 17 號倉庫，用燈向對岸漁船發出求救訊號。",
    "foreshadow",
    "建立一個日後能被重新理解的異常",
    "好奇：誰仍留在裡面？",
  ],
  [
    "最後一張船票",
    "阿澤把自己的船票交給林，說他很快就到。",
    "dialogue",
    "讓保護與隱瞞同時成立",
    "暫時信任哥哥",
  ],
  [
    "濕透的封條",
    "林在哥哥外套裡找到貨櫃封條。那是偷排廢料的貨櫃，公司卻將它報成失竊。",
    "foreshadow",
    "讓關係中的疑點成為可見的證據",
    "懷疑哥哥涉案",
  ],
  [
    "刪掉的電話",
    "阿澤當著林的面刪除一則語音訊息。",
    "action",
    "信任第一次出現裂縫",
    "誤以為他在銷毀罪證",
  ],
  [
    "錯誤的指認",
    "巡邏員展示阿澤進入倉庫的照片。",
    "reveal",
    "把片面真相變成一個錯誤結論",
    "從懷疑走向誤判",
  ],
  [
    "他沒有否認",
    "林質問阿澤；他只說：「你上船就好。」",
    "dialogue",
    "讓善意造成更深的傷害",
    "想知道他在保護誰",
  ],
  [
    "錄音機的空格",
    "林循封條上的倉庫編號追查，在 17 號倉庫找到哥哥的錄音機，但記憶卡不見了。",
    "foreshadow",
    "保留缺口，不提前揭露答案",
    "確認還有另一段故事",
  ],
  [
    "把門反鎖",
    "林鎖住倉库側門，想逼哥哥說實話。",
    "action",
    "讓誤判產生真正的後果",
    "意識到林也可能犯錯",
  ],
  [
    "潮水越過門檻",
    "公司的人堵住正門；潮水從排水孔倒灌，而唯一的側門被林反鎖。",
    "action",
    "把資訊衝突變成迫切的共同危機",
    "兄妹不能再各自逃避",
  ],
  [
    "燈下的暗號",
    "阿澤讓林看倉庫燈：三短一長，求救暗號。",
    "reveal",
    "回收最初的異常，重寫燈的意義",
    "恍然：亮燈不是同謀的訊號",
  ],
  [
    "記憶卡在船票裡",
    "林撕開船票，找到哥哥藏入的記憶卡。",
    "reveal",
    "將保護行動與實物證據連接",
    "理解哥哥一直想讓證據離港",
  ],
  [
    "我也要留下來",
    "林打開自己反鎖的側門，和哥哥逃出。她決定不登船，要留下公開錄音。",
    "dialogue",
    "讓人物主動選擇新的關係方式",
    "從知道真相走向承擔代價",
  ],
  [
    "未剪接的錄音",
    "兄妹用港口廣播播出排污指令的完整錄音。",
    "action",
    "把私人的秘密轉為所有人的共同知識",
    "懸念轉為對後果的期待",
  ],
  [
    "亮起第二盞燈",
    "對岸漁船亮燈回應；其他船陸續加入。",
    "action",
    "讓最初孤立的訊號形成集體回應",
    "看見行動的擴散",
  ],
  [
    "沒有搭上的末班船",
    "末班船離港，兄妹站在堤岸接受調查。",
    "action",
    "兌現選擇的代價，拒絕廉價勝利",
    "勝利帶有失去",
  ],
  [
    "下次不要替我決定",
    "調查告一段落後，林買來兩張新船票，把一張交給阿澤：「下次不要替我決定。」",
    "dialogue",
    "以新的相處規則完成弧線",
    "重新信任，但不再盲從",
  ],
] as const;
export function createSample(): Project {
  const p: Project = {
    schemaVersion: 2,
    sampleKind: "fog-harbor",
    timelines: {} as Timelines,
    title: "霧港末班船",
    premise:
      "封港之夜，一名女孩誤把哥哥的保護當成背叛。當唯一的末班船即將離開，她必須選擇相信證據，還是相信一個不肯解釋的人。",
    units: [],
    tracks: [
      {
        id: "lin",
        name: "林 · 妹妹",
        kind: "character",
        color: "#77c9b0",
        description: "信任 → 懷疑 → 決裂 → 主動理解",
        initial: { ...lin0 },
      },
      {
        id: "ze",
        name: "阿澤 · 哥哥",
        kind: "character",
        color: "#dfa96e",
        description: "隱瞞 → 孤立 → 坦白 → 共同承擔",
        initial: { ...ze0 },
      },
      {
        id: "audience",
        name: "觀眾",
        kind: "audience",
        color: "#a6a1e3",
        description: "好奇 → 誤判 → 恍然 → 重讀",
        initial: { ...aud0 },
      },
    ],
    transitions: [],
  };
  const add = (
    id: string,
    parentId: string | null,
    kind: Unit["kind"],
    title: string,
    summary: string,
  ) => {
    const n: Unit = {
      id,
      parentId,
      kind,
      title,
      summary,
      eventType: "action",
      intent: "",
      audienceEffect: "",
      turningPoint: false,
      stages: blankStages(),
    };
    p.units.push(n);
    return n;
  };
  add("story", null, "story", "霧港末班船", p.premise);
  const acts = [
    ["a1", "I · 相信表面", "一個異常被當作罪證"],
    ["a2", "II · 付出代價", "錯誤結論逼出真正的選擇"],
    ["a3", "III · 共同承擔", "理解不是免除代價"],
  ];
  acts.forEach((a) => add(a[0], "story", "act", a[1], a[2]));
  const seqs = [
    ["q1", "a1", "離港之前", "建立信任與第一個疑點"],
    ["q2", "a1", "片面證據", "懷疑變成決裂"],
    ["q3", "a2", "真相浮出", "同一證據被重新理解"],
    ["q4", "a3", "把秘密說出去", "人物以行動完成改變"],
  ];
  seqs.forEach((s) => add(s[0], s[1], "sequence", s[2], s[3]));
  const scenes = [
    "碼頭 · 停電後",
    "家門口 · 濕外套",
    "巡邏站 · 一張照片",
    "17 號倉庫 · 側門",
    "倉庫內 · 漲潮",
    "倉庫內 · 船票",
    "廣播室 · 午夜",
    "堤岸 · 末班船",
  ];
  scenes.forEach((title, i) =>
    add(
      `s${i + 1}`,
      `q${Math.floor(i / 2) + 1}`,
      "scene",
      title,
      [
        "阿澤秘密求救，把藏有證據的船票交給妹妹，希望她先離港。",
        "貨櫃封條與被刪掉的訊息讓林懷疑哥哥涉案。",
        "照片加深誤會；哥哥拒絕解釋，林決定自行追查。",
        "林找到缺卡的錄音機，反鎖側門逼哥哥交代。",
        "兄妹被困；阿澤說出燈光是求救暗號，林開始修正判斷。",
        "船票裡的記憶卡揭開真相；林打開側門，選擇留下公開證據。",
        "兄妹用廣播播出錄音，對岸漁船回應，秘密成為共同知識。",
        "兄妹錯過末班船、留下受查；事後約定不再替彼此決定。",
      ][i],
    ),
  );
  events.forEach((e, i) => {
    const n = add(`e${i + 1}`, `s${Math.floor(i / 2) + 1}`, "beat", e[0], e[1]);
    n.eventType = e[2];
    n.intent = e[3];
    n.audienceEffect = e[4];
    n.turningPoint = [3, 7, 9, 11, 15].includes(i);
    n.stages.blueprint.text = e[3];
    n.stages.actor.text =
      i === 5
        ? "阿澤避開目光，停半拍才說「你上船就好」。不替他解釋動機。"
        : i === 11
          ? "林停止摸索逃生的門，轉身走向哥哥。台詞是選擇的結果。"
          : "";
    n.stages.director.text =
      i === 9 ? "先保留燈光的節奏，再讓林看見；讓觀眾與她同時重讀第一幕。" : "";
  });
  const put = (
    eventId: string,
    trackId: string,
    interpretation: string,
    reaction: string,
    after: Snapshot,
  ) =>
    p.transitions.push({ eventId, trackId, interpretation, reaction, after });
  put(
    "e1", "ze",
    "獨自守住證據也無法離開封鎖的港口，需要有人接應",
    "躲在倉庫裡，用燈向對岸漁船發出求救暗號",
    snap("秘密求援", "公司控制出口，錄音是能揭露偷排的證據", "讓漁船接應並把證據送出港", "不確定對岸是否看見訊號", "不再讓公司的偷排被掩蓋"),
  );
  put(
    "e2",
    "lin",
    "他還是會照顧我",
    "收下船票，替哥哥保留位置",
    snap(
      "信任",
      "哥哥把離開的機會留給我",
      "等哥哥一起走",
      "封港和時間壓力",
      "不想再次失去家人",
    ),
  );
  put(
    "e3",
    "lin",
    "封條把哥哥與失竊連在一起",
    "把封條藏起，暫不質問",
    snap(
      "懷疑",
      "哥哥持有貨櫃封條；原因未知",
      "私下確認哥哥是否涉案",
      "不敢破壞關係",
      "需要信任能被證明",
    ),
  );
  put(
    "e4",
    "ze",
    "再說一句就會把她捲進來",
    "刪掉威脅訊息",
    snap(
      "孤立",
      "公司已發現他複製錄音",
      "讓林帶記憶卡離開",
      "不敢說出船票的秘密",
      "以隱瞞維持保護",
    ),
  );
  put(
    "e5",
    "audience",
    "照片似乎坐實哥哥涉案",
    "把先前線索串成錯誤解釋",
    snap(
      "誤判",
      "阿澤確實進了倉庫；目的仍未知",
      "等待他承認罪行",
      "把出現地點當作動機",
      "希望拼出一致的答案",
    ),
  );
  put(
    "e6",
    "lin",
    "他拒絕解釋，就是不相信我",
    "轉身自行追查",
    snap(
      "決裂",
      "哥哥被拍到進倉庫，且拒絕說明",
      "迫使哥哥交出真相",
      "哥哥的沉默",
      "不願再被替自己決定",
    ),
  );
  put(
    "e8",
    "lin",
    "阻止他離開，就能讓他說話",
    "鎖住側門",
    snap(
      "控制",
      "倉庫與錄音機有關，但缺少記憶卡",
      "把哥哥留下來對質",
      "不知道門也是逃生出口",
      "以掌控抵抗不安",
    ),
  );
  put(
    "e9",
    "ze",
    "一個人承擔已經傷害了她",
    "停止掩飾，指向燈",
    snap(
      "坦白",
      "公司正要淹掉倉庫；側門被鎖",
      "讓林理解訊號並合作逃生",
      "信任已經破裂",
      "承認保護也可能成為傷害",
    ),
  );
  put(
    "e10",
    "lin",
    "那盞燈是在求救，不是在接應",
    "跟著哥哥辨認訊號",
    snap(
      "重新理解",
      "亮燈是求救；哥哥正在被追捕",
      "找到能證明這件事的完整證據",
      "仍不知道記憶卡在哪裡",
      "願意修正自己的判斷",
    ),
  );
  put(
    "e10",
    "audience",
    "第一幕的燈有完全不同的意義",
    "重新理解已經看過的線索",
    snap(
      "恍然",
      "燈是求救訊號；片面照片誤導了判斷",
      "看見真相能否被公開",
      "公司仍控制港口",
      "希望理解轉化成行動",
    ),
  );
  put(
    "e11",
    "lin",
    "哥哥想救的不只是自己",
    "打開記憶卡，聽完整錄音",
    snap(
      "理解",
      "船票裡是偷排廢料的完整錄音",
      "與哥哥一起公開證據",
      "離港機會即將消失",
      "把選擇權拿回自己手中",
    ),
  );
  put(
    "e12",
    "lin",
    "留下是我自己的選擇",
    "走向廣播室",
    snap(
      "主動承擔",
      "公開錄音可能使兄妹一同被調查",
      "把錄音播給全港",
      "可能失去離港機會",
      "用行動定義新的信任",
    ),
  );
  put(
    "e12",
    "ze",
    "她有權決定自己承擔什麼",
    "交出廣播室的鑰匙",
    snap(
      "共同承擔",
      "林知道全部風險仍選擇留下",
      "與林一起公開真相",
      "必須放棄獨自控制局面",
      "尊重比替她決定更重要",
    ),
  );
  put(
    "e13",
    "audience",
    "秘密終於成為公開的事實",
    "關注人物必須付出的代價",
    snap(
      "共同見證",
      "完整錄音已公開，偷排事實可被核查",
      "看見公開之後的後果",
      "結果還沒有保證",
      "期待選擇有真實重量",
    ),
  );
  put(
    "e16",
    "lin",
    "信任可以有界線",
    "交出另一張票，也說出自己的規則",
    snap(
      "有界線的信任",
      "哥哥願意讓她參與決定",
      "一起面對調查與下一次選擇",
      "過去傷害不會立刻消失",
      "彼此尊重而非盲目依賴",
    ),
  );
  put(
    "e16",
    "ze",
    "信任需要共享選擇，而非代替選擇",
    "接過票，等待林先走",
    snap(
      "平等",
      "林仍願意同行，但不再接受隱瞞",
      "學習把真相與決定交還對方",
      "習慣以沉默保護人",
      "願意讓保護變成合作",
    ),
  );
  const logic: [string, string, string?][] = [
    ["阿澤複製了公司的偷排錄音，被困在封鎖的港口，需要外界接應。", "倉庫的燈成為可見線索；林尚不知道它是求救。"],
    ["阿澤怕證據被公司攔下，也想讓妹妹脫險，將記憶卡藏進船票。", "林收下船票，離港的機會與證據都交到她手裡。"],
    ["阿澤從貨櫃取得偷排證據，卻把封條留在外套；林只聽過公司的失竊說法。", "林把封條當成哥哥涉案的線索，開始私下確認。"],
    ["公司發來威脅訊息；阿澤擔心林看見內容後會被捲入。", "訊息被刪除，保護的用意反而看起來像銷毀罪證。"],
    ["巡邏隊掌握阿澤進倉庫的照片，卻沒有提供他進去的目的。", "片面證據強化林與觀眾的誤判。"],
    ["林看到照片後質問哥哥；阿澤仍認為不解釋才能保護她。", "林將沉默理解為不信任，決定自行追查。", "e5"],
    ["哥哥拒絕交代，林便循外套上的封條編號追查倉庫。", "林發現錄音機，卻因缺少記憶卡而無法確認真相。", "e6"],
    ["林以為把哥哥留下對質，就能問出錄音機缺少的證據在哪裡。", "唯一可用的側門被鎖；林的誤判實際削弱了兩人的逃生路徑。", "e7"],
    ["公司追兵封住正門；漲潮時水倒灌，林剛鎖住的側門又阻擋逃生。", "兄妹同時受困，阿澤不得不停止隱瞞、尋求林的合作。", "e8"],
    ["困局證明沉默無法保護林，阿澤向她解釋一直在發出的燈光暗號。", "林明白哥哥是在求救，願意重新檢查先前的判斷。", "e9"],
    ["林理解燈號後追問完整證據；阿澤告訴她記憶卡藏在船票裡。", "錄音把貨櫃、公司的追捕與哥哥的保護連成完整真相。", "e10"],
    ["林聽完錄音，知道自己可以帶證據先走，也可以留下與哥哥共同承擔。", "她打開側門，兩人脫困；阿澤交出廣播室鑰匙，一起走向廣播室。", "e11"],
    ["兄妹已決定留下，帶著記憶卡與鑰匙抵達港口廣播室。", "完整排污指令傳遍港口，公司不能再獨占事情的說法。", "e12"],
    ["對岸漁船聽見完整錄音，確認求救與公司的偷排有關。", "更多船隻亮燈回應，兄妹不再孤立無援。", "e13"],
    ["兄妹選擇公開證據並配合調查，因此錯過唯一的末班船。", "真相公開了，離港計畫卻必須延後；選擇留下帶來實際代價。", "e13"],
    ["共同受查後，兄妹重新安排離港；林仍願意同行，但要求參與每個決定。", "兩人以共享真相與選擇取代單方面保護，建立有界線的信任。", "e15"],
  ];
  logic.forEach(([cause, outcome, causeEventId], i) => { p.units.find(u => u.id === `e${i + 1}`)!.storyLogic = { cause, outcome, ...(causeEventId ? { causeEventId } : {}) }; });
  p.timelines = initialTimelines(p);
  // Presentation notes explicitly withhold facts that the author knows in Reality.
  p.timelines.narrative.placements.find(o => o.eventId === "e1")!.note = "封港後，17 號倉庫仍有一盞燈。林看見它，但不知道誰在發訊號。";
  p.timelines.narrative.placements.find(o => o.eventId === "e3")!.note = "林在哥哥外套裡找到一張公司報稱失竊貨櫃的封條。她尚不知道貨櫃與偷排有關。";

  return p;
}

export function createTimelineDemo(): Project {
  const p = createSample();
  const opening = {
    ...structuredClone(
      p.timelines.narrative.placements.find((x) => x.eventId === "e9")!,
    ),
    id: "narrative-opening",
    containerId: "s1",
    note: "冷開場：水越過門檻。我們尚不知道兄妹為何被困。",
    disclosure: "withheld" as const,
    knowledgeNote: "只展示危機，不交代起因。",
    updates: [],
  };
  p.timelines.narrative.placements.unshift(opening);
  Object.assign(
    p.timelines.narrative.placements.find((x) => x.eventId === "e1")!,
    {
      mode: "flashback",
      note: "倒敘：回到封港剛開始，倉庫的燈第一次出現。",
      knowledgeNote: "時間回到危機之前；燈的意義仍被保留。",
    },
  );
  Object.assign(
    p.timelines.narrative.placements.find(
      (x) => x.eventId === "e9" && x.id !== "narrative-opening",
    )!,
    {
      mode: "repeat",
      note: "回到冷開場；這次已知道林反鎖側門，危機有了新的因果意義。",
    },
  );
  const order = ["e1", "e5", "e10", "e1", "e11", "e13", "e16"];
  p.timelines.audience.placements = order.map((id, i) => ({
    ...structuredClone(
      p.timelines.audience.placements.find((x) => x.eventId === id)!,
    ),
    id: `audience-disclosure-${i}`,
    mode: i === 3 ? ("repeat" as const) : ("disclosure" as const),
    disclosure:
      i === 1
        ? ("misleading" as const)
        : i >= 2
          ? ("confirmed" as const)
          : ("partial" as const),
  }));
  const repeated = p.timelines.audience.placements[3];
  repeated.containerId = "s5";
  repeated.note = "重新理解同一盞燈：第一個線索不是同謀訊號，而是求救。";
  repeated.knowledgeNote =
    "再次展示早先事件，改變讀法，沒有新增另一盞燈或另一件歷史事件。";
  repeated.updates = [
    {
      trackId: "audience",
      interpretation: "原來第一幕的燈已經是在求救",
      reaction: "重讀開場，修正先前推斷",
      after: snap(
        "重讀",
        "倉庫從最初就在求救；亮燈不是接應犯罪",
        "重新判斷哥哥之前的舉動",
        "仍缺少記憶卡的證據",
        "願意放棄第一個看似完整的解釋",
      ),
    },
  ];
  p.timelines.audience.placements[4].updates = [
    {
      trackId: "audience",
      interpretation: "船票的保護與證據送出港是同一個行動",
      reaction: "接受完整證據，同時關注代價",
      after: snap(
        "完整理解",
        "船票藏有記憶卡；哥哥並非要独自逃走",
        "看見兄妹如何承擔公開證據的風險",
        "末班船即將離港",
        "希望理解能轉化成共同選擇",
      ),
    },
  ];
  p.timelines.audience.placements[6].updates = [
    {
      trackId: "audience",
      interpretation: "信任不是回到盲從，而是共享決定",
      reaction: "回看兄妹的關係如何改變",
      after: snap(
        "理解新關係",
        "兄妹留下受調查，並建立共同決定的規則",
        "看見弧線的結果",
        "代價不會被抹去",
        "重視人物的自主選擇",
      ),
    },
  ];
  p.timelines.audience.placements[0].knowledgeNote = "看見異常，但不知道原因。";
  p.timelines.audience.placements[1].knowledgeNote =
    "照片是真實的；觀眾將地點誤當作動機。";
  p.timelines.audience.placements[2].knowledgeNote = "燈的真正用途得到確認。";
  // Authored design example, never an observation or inferred viewer response.
  const designs = [
    {
      emotions: { curiosity: 75, tension: 25, trust: 45 },
      cognition: {
        knows: "封港後倉庫仍亮著燈",
        believes: "可能有人暗中接應",
        questions: "誰在裡面？",
      },
      supportIds: [],
      expectations: [
        {
          id: "light-prediction",
          kind: "prediction",
          text: "燈是同謀接應的訊號",
          response: "subverted",
          responseId: "audience-disclosure-2",
        },
      ],
    },
    {
      emotions: { curiosity: 60, tension: 70, trust: 15 },
      cognition: {
        knows: "照片顯示阿澤進過倉庫",
        believes: "他可能參與失竊",
        questions: "照片能證明動機嗎？",
      },
      supportIds: ["audience-disclosure-0"],
      expectations: [
        {
          id: "brother-hope",
          kind: "hope",
          text: "哥哥有可以理解的理由",
          response: "realized",
          responseId: "audience-disclosure-4",
        },
      ],
    },
    {
      emotions: { curiosity: 65, tension: 55, trust: 60, relief: 45 },
      cognition: {
        knows: "三短一長是求救暗號",
        believes: "先前對亮燈的解讀有誤",
        questions: "哥哥想把什麼送出去？",
      },
      supportIds: ["audience-disclosure-0"],
      expectations: [],
    },
    {
      emotions: { curiosity: 50, tension: 40, trust: 65, relief: 55 },
      cognition: {
        knows: "最初的燈已在求救",
        believes: "哥哥的隱瞞可能是在保護人",
        questions: "缺少的證據在哪裡？",
      },
      supportIds: ["audience-disclosure-0", "audience-disclosure-2"],
      expectations: [],
    },
    {
      emotions: { curiosity: 35, tension: 60, trust: 85, relief: 65 },
      cognition: {
        knows: "記憶卡藏在船票中",
        believes: "哥哥想讓證據安全離港",
        questions: "公開後要付出什麼代價？",
      },
      supportIds: ["audience-disclosure-2"],
      expectations: [
        {
          id: "cost-fear",
          kind: "fear",
          text: "兄妹會失去立即離港的機會",
          response: "realized",
          responseId: "audience-disclosure-6",
        },
      ],
    },
    {
      emotions: { curiosity: 30, tension: 80, trust: 85, relief: 35 },
      cognition: {
        knows: "錄音透過廣播公開",
        believes: "公開證據仍需要承擔風險",
        questions: "其他人會回應嗎？",
      },
      supportIds: ["audience-disclosure-4"],
      expectations: [],
    },
    {
      emotions: { tension: 20, trust: 90, sadness: 35, relief: 80 },
      cognition: {
        knows: "兄妹留下接受調查",
        believes: "信任可以建立在共同決定上",
        questions: "新的關係能持續嗎？",
      },
      supportIds: ["audience-disclosure-4", "audience-disclosure-5"],
      expectations: [],
    },
  ] satisfies import("./audience").AudienceDesign[];
  p.timelines.audience.placements.forEach((item, i) => {
    item.audienceDesign = { ...designs[i], example: true };
  });
  p.narrativeLines = [
    { id: 'line-evidence', title: '燈號與證據', color: '#61d7ff', example: true,
      eventIds: ['e1', 'e3', 'e5', 'e7', 'e10', 'e11', 'e13', 'e14'],
      roles: [
        { id: 'role-evidence-base', basis: 'narrative', scope: { kind: 'whole' }, prominence: 'sub', visibility: 'covert', note: '示例：前段以局部線索呈現；不代表觀眾完全不知情。' },
        { id: 'role-evidence-turn', basis: 'narrative', scope: { kind: 'range', startOccurrenceId: 'narrative-e10', endOccurrenceId: 'narrative-e13' }, prominence: 'main', visibility: 'overt', note: '示例：暗號被讀懂後，證據線成為這個區段的主要行動。' },
        { id: 'role-evidence-audience', basis: 'audience', scope: { kind: 'whole' }, prominence: 'sub', visibility: 'covert', note: '示例：此時間依據的角色獨立編排。' },
        { id: 'role-evidence-reread', basis: 'audience', scope: { kind: 'range', startOccurrenceId: 'audience-disclosure-3', endOccurrenceId: 'audience-disclosure-5' }, prominence: 'main', visibility: 'overt', note: '示例：同一盞燈再次呈現時，這次屬於明線主段。' },
      ],
    },
    { id: 'line-trust', title: '兄妹的信任', color: '#d7a4ff', example: true,
      eventIds: ['e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e15', 'e16'],
      roles: [{ id: 'role-trust-base', basis: 'narrative', scope: { kind: 'whole' }, prominence: 'main', visibility: 'overt', note: '示例：主線與明線是兩個獨立指定的角色。' }],
    },
  ];
  // Optional authored demonstration only. Never merged into an existing project.
  p.realityTiming = { mode: 'relations', relations: [
    ...p.timelines.reality.placements.slice(1).flatMap((o, i) => p.timelines.reality.placements[i].eventId === 'e3' && o.eventId === 'e4' ? [] : [{ id: `demo-before-${i}`, kind: 'before' as const, fromEventId: p.timelines.reality.placements[i].eventId, toEventId: o.eventId, note: '虛構示例明確設定的世界先後' }]),
    { id: 'demo-same-e3-e4', kind: 'same-time', fromEventId: 'e3', toEventId: 'e4', note: '虛構示例：林調查封條的同時，阿澤在另一處刪除威脅訊息；呈現仍分成兩個節點。' },
  ] };
  p.storyTracks = [
    { id: 'demo-lin-goal', name: '林想做到什麼', meaning: '對應同一事件在世界中已寫下的目標；不代表觀眾已知道。', owner: { kind: 'character', trackId: 'lin' }, epistemic: 'authored-fact', basis: 'narrative', dimension: 'goal', representation: 'state', source: { kind: 'snapshot', field: 'goal' }, entries: [], example: true },
    { id: 'demo-lin-belief', name: '林認為自己做得到什麼', meaning: '人物對自己能力的判斷。這是作者填寫的主觀認知，不由成功或失敗倒推。', owner: { kind: 'character', trackId: 'lin' }, targetTrackId: 'lin', epistemic: 'self-belief', basis: 'narrative', dimension: 'ability', representation: 'state', source: { kind: 'manual' }, entries: [
      { id: 'demo-belief-e3', anchor: { kind: 'occurrence', eventId: 'e3', occurrenceId: 'narrative-e3' }, value: '我能先私下查清哥哥是否涉案', note: '虛構示例的明確人物認知' },
      { id: 'demo-belief-e9', anchor: { kind: 'occurrence', eventId: 'e9', occurrenceId: 'narrative-e9' }, value: '我一個人無法解開這個困局', note: '冷開場沒有套用這次已知；兩次呈現分開填寫' },
      { id: 'demo-belief-e12', anchor: { kind: 'occurrence', eventId: 'e12', occurrenceId: 'narrative-e12' }, value: '我能選擇與哥哥共同承擔', note: '' },
    ], example: true },
    { id: 'demo-lin-resources', name: '林手上實際有哪些資源', meaning: '作者設定的可用資源，與人物對能力的信心分開記錄。', owner: { kind: 'character', trackId: 'lin' }, epistemic: 'authored-fact', basis: 'reality', dimension: 'resources', representation: 'state', source: { kind: 'manual' }, entries: [
      { id: 'demo-resource-e2', anchor: { kind: 'event', eventId: 'e2' }, value: '船票（內藏記憶卡，但她尚不知道）', note: '世界事實不會自動變成角色或觀眾知識' },
      { id: 'demo-resource-e11', anchor: { kind: 'event', eventId: 'e11' }, value: '已找到記憶卡與可核查的錄音', note: '' },
      { id: 'demo-resource-e12', anchor: { kind: 'event', eventId: 'e12' }, value: '記憶卡、錄音與廣播室鑰匙', note: '' },
    ], example: true },
    { id: 'demo-audience-lin', name: '觀眾怎麼看林的判斷', meaning: '作者希望觀眾在這次呈現後如何理解林；不是林的內心，也不是實測觀眾意見。', owner: { kind: 'audience' }, targetTrackId: 'lin', epistemic: 'audience-belief', basis: 'narrative', dimension: 'judgment', representation: 'state', source: { kind: 'manual' }, entries: [
      { id: 'demo-judgment-e3', anchor: { kind: 'occurrence', eventId: 'e3', occurrenceId: 'narrative-e3' }, value: '她的懷疑有眼前線索支持，但動機仍未知', note: '' },
      { id: 'demo-judgment-e8', anchor: { kind: 'occurrence', eventId: 'e8', occurrenceId: 'narrative-e8' }, value: '她想追查真相，卻誤把控制出口當成解法', note: '' },
      { id: 'demo-judgment-e12', anchor: { kind: 'occurrence', eventId: 'e12', occurrenceId: 'narrative-e12' }, value: '她理解風險後，仍自主選擇留下', note: '' },
    ], example: true },
    { id: 'demo-relation', name: '兄妹如何共同決定', meaning: '明確描述兩人的關係階段，沒有把成長換算成分數。', owner: { kind: 'relationship', trackIds: ['lin', 'ze'] }, basis: 'reality', dimension: 'relationship', representation: 'state', source: { kind: 'manual' }, entries: [
      { id: 'demo-relation-e2', anchor: { kind: 'event', eventId: 'e2' }, value: '阿澤替林作決定', note: '' },
      { id: 'demo-relation-e12', anchor: { kind: 'event', eventId: 'e12' }, value: '開始共同承擔', note: '' },
      { id: 'demo-relation-e16', anchor: { kind: 'event', eventId: 'e16' }, value: '共享真相與選擇', note: '' },
    ], example: true },
    { id: 'demo-clue', name: '燈號如何被重新理解', meaning: '作者明確連結的線索與回收。連結不是另一種因果，也不會自行猜測揭露時刻。', owner: { kind: 'custom', label: '燈號與證據' }, basis: 'narrative', dimension: 'clue', representation: 'link', source: { kind: 'manual' }, entries: [
      { id: 'demo-light-link', anchor: { kind: 'occurrence', eventId: 'e1', occurrenceId: 'narrative-e1' }, value: '倉庫仍有一盞燈', note: '第一次呈現不說明訊號的意思', reveal: { kind: 'occurrence', eventId: 'e10', occurrenceId: 'narrative-e10' } },
    ], example: true },
    { id: 'demo-audience-tension', name: '預期緊張感', meaning: '沿用已有作者情緒設計的相對強度；不是觀眾實測，也不從文字計算。', owner: { kind: 'audience' }, epistemic: 'intended-response', basis: 'audience', dimension: 'emotion', representation: 'number', scale: { min: 0, max: 100, minLabel: '低', maxLabel: '高' }, source: { kind: 'audience-emotion', emotion: 'tension' }, entries: [], example: true },
  ];
  return p;
}
