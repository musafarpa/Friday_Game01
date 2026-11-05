export interface BankQuestion {
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const QUESTION_BANK: BankQuestion[] = [
  // --- 1. Politics & Government ---
  {
    topic: 'Politics & Government',
    question: 'How many fundamental rights are currently recognized in the Indian Constitution?',
    option_a: '5',
    option_b: '6',
    option_c: '7',
    option_d: '8',
    correct_option: 'B',
    explanation: 'There are currently 6 fundamental rights recognized in the Indian Constitution after the Right to Property was made a legal right.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'Who is known as the Chief Architect and Father of the Indian Constitution?',
    option_a: 'Dr. B.R. Ambedkar',
    option_b: 'Jawaharlal Nehru',
    option_c: 'Sardar Vallabhbhai Patel',
    option_d: 'Dr. Rajendra Prasad',
    correct_option: 'A',
    explanation: 'Dr. Bhimrao Ramji Ambedkar served as the chairman of the Drafting Committee of the Indian Constitution.',
    difficulty: 'easy'
  },
  {
    topic: 'Politics & Government',
    question: 'What is the minimum voting age for citizens in India as enacted by the 61st Amendment Act?',
    option_a: '21 years',
    option_b: '20 years',
    option_c: '18 years',
    option_d: '16 years',
    correct_option: 'C',
    explanation: 'The 61st Constitutional Amendment Act lowered the voting age for elections to the Lok Sabha and Vidhan Sabhas from 21 to 18 years.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'Which constitutional body is responsible for conducting free and fair elections in India?',
    option_a: 'NITI Aayog',
    option_b: 'Supreme Court of India',
    option_c: 'Election Commission of India',
    option_d: 'Union Public Service Commission',
    correct_option: 'C',
    explanation: 'The Election Commission of India operates under Article 324 of the Constitution to administer elections.',
    difficulty: 'medium'
  },
  {
    topic: 'Politics & Government',
    question: 'Under which Article of the Indian Constitution can the President declare a National Emergency?',
    option_a: 'Article 352',
    option_b: 'Article 356',
    option_c: 'Article 360',
    option_d: 'Article 370',
    correct_option: 'A',
    explanation: 'Article 352 empowers the President to proclaim a national emergency on grounds of war, external aggression, or armed rebellion.',
    difficulty: 'hard'
  },

  // --- 2. Pollution & Environment ---
  {
    topic: 'Pollution & Environment',
    question: 'Which daily habit is most effective in eliminating single-use plastic waste?',
    option_a: 'Using reusable cloth bags and stainless steel water bottles',
    option_b: 'Burning plastic waste in backyard pits',
    option_c: 'Throwing plastic bottles into regular trash bins',
    option_d: 'Purchasing more bottled beverages',
    correct_option: 'A',
    explanation: 'Carrying reusable bags and bottles prevents the manufacturing and disposal cycle of disposable single-use plastics.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which renewable energy source harnesses heat from beneath the Earth surface?',
    option_a: 'Solar Power',
    option_b: 'Geothermal Energy',
    option_c: 'Biomass Energy',
    option_d: 'Hydroelectric Power',
    correct_option: 'B',
    explanation: 'Geothermal energy is thermal energy generated and stored in the Earth crust.',
    difficulty: 'easy'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What is the primary gas contributing to the greenhouse effect on Earth?',
    option_a: 'Argon',
    option_b: 'Carbon Dioxide',
    option_c: 'Oxygen',
    option_d: 'Helium',
    correct_option: 'B',
    explanation: 'Carbon dioxide is the most prevalent anthropogenic greenhouse gas driving global climate warming.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'What does AQI stand for in environmental monitoring?',
    option_a: 'Atmospheric Quality Index',
    option_b: 'Air Quality Indicator',
    option_c: 'Air Quality Index',
    option_d: 'Aerosol Quantity Index',
    correct_option: 'C',
    explanation: 'AQI stands for Air Quality Index, used by government agencies to communicate how polluted the air currently is.',
    difficulty: 'medium'
  },
  {
    topic: 'Pollution & Environment',
    question: 'Which international treaty signed in 1987 successfully phased out ozone-depleting substances?',
    option_a: 'Paris Agreement',
    option_b: 'Kyoto Protocol',
    option_c: 'Montreal Protocol',
    option_d: 'Ramsar Convention',
    correct_option: 'C',
    explanation: 'The Montreal Protocol on Substances that Deplete the Ozone Layer successfully halted CFC emissions worldwide.',
    difficulty: 'hard'
  },

  // --- 3. AI & Technology ---
  {
    topic: 'AI & Technology',
    question: 'What does the abbreviation "AI" stand for in computing?',
    option_a: 'Automated Intelligence',
    option_b: 'Artificial Intelligence',
    option_c: 'Applied Integration',
    option_d: 'Algorithmic Interface',
    correct_option: 'B',
    explanation: 'AI stands for Artificial Intelligence, the simulation of human intelligence by computer systems.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'What does the "GPT" stand for in OpenAI\'s ChatGPT?',
    option_a: 'Generative Pre-trained Transformer',
    option_b: 'General Purpose Tool',
    option_c: 'Graphical Processing Terminal',
    option_d: 'Generated Predictive Thinking',
    correct_option: 'A',
    explanation: 'GPT stands for Generative Pre-trained Transformer, an architecture introduced for natural language models.',
    difficulty: 'easy'
  },
  {
    topic: 'AI & Technology',
    question: 'Which cybersecurity measure requires two separate forms of identification before granting access?',
    option_a: 'CAPTCHA',
    option_b: 'Two-Factor Authentication (2FA)',
    option_c: 'Firewall Filter',
    option_d: 'End-to-End Encryption',
    correct_option: 'B',
    explanation: 'Two-Factor Authentication (2FA) adds a security layer requiring a password plus a secondary credential (like an OTP or hardware key).',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'Which company developed the Gemini family of multimodal artificial intelligence models?',
    option_a: 'Google',
    option_b: 'Meta',
    option_c: 'Amazon',
    option_d: 'Apple',
    correct_option: 'A',
    explanation: 'Gemini is developed by Google DeepMind and Google as their next-generation multimodal foundation model.',
    difficulty: 'medium'
  },
  {
    topic: 'AI & Technology',
    question: 'In deep learning, what mechanism allows Transformer models to dynamically focus on different parts of an input sequence?',
    option_a: 'Convolutional Pooling',
    option_b: 'Attention Mechanism',
    option_c: 'Stochastic Gradient Descent',
    option_d: 'Dropout Layer',
    correct_option: 'B',
    explanation: 'The Attention Mechanism enables transformers to weight relationships between all tokens across the sequence regardless of distance.',
    difficulty: 'hard'
  },

  // --- 4. Social Media ---
  {
    topic: 'Social Media',
    question: 'What is the maximum standard length of an Instagram Reel in 2024?',
    option_a: '15 seconds',
    option_b: '30 seconds',
    option_c: '90 seconds',
    option_d: '10 minutes',
    correct_option: 'C',
    explanation: 'Standard Instagram Reels recorded directly in the app have a maximum duration of 90 seconds.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'Which parent company owns Instagram, WhatsApp, and Facebook?',
    option_a: 'Alphabet',
    option_b: 'Meta',
    option_c: 'ByteDance',
    option_d: 'Microsoft',
    correct_option: 'B',
    explanation: 'Meta Platforms (formerly Facebook Inc.) is the parent organization of WhatsApp, Instagram, and Facebook.',
    difficulty: 'easy'
  },
  {
    topic: 'Social Media',
    question: 'What does the blue tick badge typically verify on social media profiles?',
    option_a: 'The user has over 1 million followers',
    option_b: 'The identity and authenticity of a notable or subscribed profile',
    option_c: 'The account never posts advertisements',
    option_d: 'The user is an official employee of the platform',
    correct_option: 'B',
    explanation: 'The verification badge signifies verified authenticity or active verified subscription on major social platforms.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'Which feature in WhatsApp ensures that only sender and receiver can read messages or hear calls?',
    option_a: 'Two-Step Verification',
    option_b: 'End-to-End Encryption',
    option_c: 'Disappearing Messages',
    option_d: 'Chat Lock',
    correct_option: 'B',
    explanation: 'End-to-end encryption secures conversations so that third parties and WhatsApp itself cannot decrypt the content.',
    difficulty: 'medium'
  },
  {
    topic: 'Social Media',
    question: 'What is the algorithmic term for the metric indicating how frequently users interact (like, share, comment) with a post?',
    option_a: 'Impression Count',
    option_b: 'Reach Velocity',
    option_c: 'Engagement Rate',
    option_d: 'Conversion Pivot',
    correct_option: 'C',
    explanation: 'Engagement Rate is the formula quantifying total interactions divided by total reach or impressions.',
    difficulty: 'hard'
  },

  // --- 5. Kerala & Current Affairs ---
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which city in Kerala was officially declared the first UNESCO "City of Literature" in India in 2024?',
    option_a: 'Thiruvananthapuram',
    option_b: 'Kozhikode',
    option_c: 'Kochi',
    option_d: 'Thrissur',
    correct_option: 'B',
    explanation: 'Kozhikode made history by becoming India\'s first UNESCO City of Literature in acknowledgment of its vibrant literary heritage.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which is the longest river flowing entirely through Kerala?',
    option_a: 'Periyar',
    option_b: 'Bharathappuzha',
    option_c: 'Pamba',
    option_d: 'Chaliyar',
    correct_option: 'A',
    explanation: 'The Periyar River is the longest river in Kerala with a total length of approximately 244 kilometers.',
    difficulty: 'easy'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'What is the official state animal of Kerala?',
    option_a: 'Indian Elephant',
    option_b: 'Bengal Tiger',
    option_c: 'Nilgiri Tahr',
    option_d: 'Indian Leopard',
    correct_option: 'A',
    explanation: 'The Indian Elephant (Elephas maximus indicus) is the designated state animal of Kerala.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'Which port in Kerala is India\'s first deepwater container transshipment port?',
    option_a: 'Cochin Port',
    option_b: 'Beypore Port',
    option_c: 'Vizhinjam International Seaport',
    option_d: 'Kollam Port',
    correct_option: 'C',
    explanation: 'Vizhinjam International Seaport in Thiruvananthapuram is India\'s first international deepwater transshipment gateway.',
    difficulty: 'medium'
  },
  {
    topic: 'Kerala & Current Affairs',
    question: 'In which year did the legendary boat rally known as the Nehru Trophy Boat Race begin on Punnamada Lake?',
    option_a: '1947',
    option_b: '1952',
    option_c: '1965',
    option_d: '1971',
    correct_option: 'B',
    explanation: 'The prime ministerial boat race began in 1952 during Jawaharlal Nehru\'s visit to Alappuzha.',
    difficulty: 'hard'
  },

  // --- 6. Cricket & Sports ---
  {
    topic: 'Cricket & Sports',
    question: 'Who captained the Indian Men\'s Cricket Team to victory in the ICC Men\'s T20 World Cup in 2024?',
    option_a: 'Virat Kohli',
    option_b: 'Rohit Sharma',
    option_c: 'Hardik Pandya',
    option_d: 'Jasprit Bumrah',
    correct_option: 'B',
    explanation: 'Rohit Sharma led the Indian squad to the ICC Men\'s T20 World Cup title in June 2024 against South Africa.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'How many players are on the field for one team in a standard game of Cricket?',
    option_a: '9',
    option_b: '10',
    option_c: '11',
    option_d: '12',
    correct_option: 'C',
    explanation: 'Each side takes the field with 11 active players.',
    difficulty: 'easy'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which legendary athlete is known as the "Flying Sikh" in Indian athletics history?',
    option_a: 'Milkha Singh',
    option_b: 'PT Usha',
    option_c: 'Neeraj Chopra',
    option_d: 'Abhinav Bindra',
    correct_option: 'A',
    explanation: 'Milkha Singh was nicknamed the Flying Sikh following his phenomenal performances in sprint events.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Who holds the record for the highest individual score in Men\'s One Day International (ODI) cricket?',
    option_a: 'Martin Guptill (237*)',
    option_b: 'Chris Gayle (215)',
    option_c: 'Rohit Sharma (264)',
    option_d: 'Virender Sehwag (219)',
    correct_option: 'C',
    explanation: 'Rohit Sharma scored a breathtaking 264 runs off 173 balls against Sri Lanka at Eden Gardens in 2014.',
    difficulty: 'medium'
  },
  {
    topic: 'Cricket & Sports',
    question: 'Which country hosted the first ever official modern Olympic Games in 1896?',
    option_a: 'France',
    option_b: 'Greece',
    option_c: 'United Kingdom',
    option_d: 'United States',
    correct_option: 'B',
    explanation: 'The inaugural modern Olympics were celebrated in Athens, Greece, in April 1896.',
    difficulty: 'hard'
  },

  // --- 7. Movies & Entertainment ---
  {
    topic: 'Movies & Entertainment',
    question: 'Which blockbuster 2024 Malayalam movie directed by Chidambaram depicts the real survival story of Guna Caves?',
    option_a: 'Aavesham',
    option_b: 'Manjummel Boys',
    option_c: 'Bramayugam',
    option_d: 'Premalu',
    correct_option: 'B',
    explanation: 'Manjummel Boys achieved historic box office records depicting the rescue of a friend trapped in the Devil\'s Kitchen caves.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which actor played the iconic character "Ranga" in the 2024 hit movie Aavesham?',
    option_a: 'Fahadh Faasil',
    option_b: 'Tovino Thomas',
    option_c: 'Prithviraj Sukumaran',
    option_d: 'Dulquer Salmaan',
    correct_option: 'A',
    explanation: 'Fahadh Faasil received widespread acclaim for his charismatic role as gangster Ranga.',
    difficulty: 'easy'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which music composer won two Academy Awards (Oscars) for Slumdog Millionaire?',
    option_a: 'Ilayaraja',
    option_b: 'A.R. Rahman',
    option_c: 'M.M. Keeravani',
    option_d: 'Sushin Shyam',
    correct_option: 'B',
    explanation: 'A.R. Rahman won Best Original Score and Best Original Song ("Jai Ho") at the 81st Academy Awards in 2009.',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'Which director helmed the globally acclaimed historical epic RRR?',
    option_a: 'S.S. Rajamouli',
    option_b: 'Prashanth Neel',
    option_c: 'Mani Ratnam',
    option_d: 'Lokesh Kanagaraj',
    correct_option: 'A',
    explanation: 'S.S. Rajamouli directed RRR, which also won an Academy Award for Best Original Song for "Naatu Naatu".',
    difficulty: 'medium'
  },
  {
    topic: 'Movies & Entertainment',
    question: 'What was the title of the first Malayalam full-length talkie feature film released in 1938?',
    option_a: 'Vigathakumaran',
    option_b: 'Balan',
    option_c: 'Neelakkuyil',
    option_d: 'Chemmeen',
    correct_option: 'B',
    explanation: 'Balan (1938) was the first sound film (talkie) in the Malayalam cinema industry, directed by S. Nottani.',
    difficulty: 'hard'
  },

  // --- 8. College & Office Life ---
  {
    topic: 'College & Office Life',
    question: 'What does the corporate acronym "WFH" stand for?',
    option_a: 'Work From Home',
    option_b: 'Work For Hours',
    option_c: 'Weekend Free Holiday',
    option_d: 'Weekly Formal Hours',
    correct_option: 'A',
    explanation: 'WFH stands for Work From Home, widely adopted across modern tech and professional workplaces.',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What document summarizes an individual\'s education, skills, and work experience for job applications?',
    option_a: 'Transcript',
    option_b: 'Resume / Curriculum Vitae',
    option_c: 'Offer Letter',
    option_d: 'Memorandum',
    correct_option: 'B',
    explanation: 'A resume or CV presents a candidate\'s qualifications and background to prospective employers.',
    difficulty: 'easy'
  },
  {
    topic: 'College & Office Life',
    question: 'What does "EOD" typically mean when sent in an office message regarding a task deadline?',
    option_a: 'Early On Duty',
    option_b: 'End Of Day',
    option_c: 'Every Other Department',
    option_d: 'Error On Delivery',
    correct_option: 'B',
    explanation: 'EOD refers to the End of the Day, indicating a submission deadline before the close of typical business hours.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'Which communication tool is most synonymous with standup channels, threads, and company huddles?',
    option_a: 'Slack',
    option_b: 'Pinterest',
    option_c: 'Snapchat',
    option_d: 'Soundcloud',
    correct_option: 'A',
    explanation: 'Slack is a premier workplace communication platform used for channels, team discussions, and app integrations.',
    difficulty: 'medium'
  },
  {
    topic: 'College & Office Life',
    question: 'What does the term "Quarterly Business Review" (QBR) evaluate in organizations?',
    option_a: 'Employee cafeteria menu options',
    option_b: 'Financial and operational performance over a three-month business period',
    option_c: 'Annual leave approval audits',
    option_d: 'IT equipment disposal schedules',
    correct_option: 'B',
    explanation: 'A QBR is a comprehensive meeting held once every fiscal quarter to review achievements and set future milestones.',
    difficulty: 'hard'
  },

  // --- 9. Money & Lifestyle ---
  {
    topic: 'Money & Lifestyle',
    question: 'What does "UPI" stand for in instant digital payment transactions?',
    option_a: 'Universal Personal Income',
    option_b: 'Unified Payments Interface',
    option_c: 'Unique Paperless Identification',
    option_d: 'United Private Investment',
    correct_option: 'B',
    explanation: 'UPI stands for Unified Payments Interface, developed by the National Payments Corporation of India (NPCI).',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'Which of the following is an essential habit for long-term financial security?',
    option_a: 'Spending 100% of income on payday',
    option_b: 'Building an emergency fund covering 3 to 6 months of expenses',
    option_c: 'Maxing out multiple credit cards on discretionary buys',
    option_d: 'Ignoring monthly bank statements',
    correct_option: 'B',
    explanation: 'An emergency fund safeguards individuals from sudden medical, employment, or domestic emergencies without taking high-interest debt.',
    difficulty: 'easy'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What is the term for the percentage increase in the general price level of goods and services over time?',
    option_a: 'Inflation',
    option_b: 'Depreciation',
    option_c: 'Dividends',
    option_d: 'Capital Gains',
    correct_option: 'A',
    explanation: 'Inflation measures how much more expensive a set of goods and services has become over a certain period.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'What is a "SIP" in the context of mutual fund investments?',
    option_a: 'Single Income Protection',
    option_b: 'Systematic Investment Plan',
    option_c: 'Standard Inflation Policy',
    option_d: 'Stock Insurance Portfolio',
    correct_option: 'B',
    explanation: 'A Systematic Investment Plan (SIP) enables disciplined regular investments of fixed amounts in mutual funds.',
    difficulty: 'medium'
  },
  {
    topic: 'Money & Lifestyle',
    question: 'According to the popular 50-30-20 budgeting rule, what should the 20% portion be allocated toward?',
    option_a: 'Needs and basic rent',
    option_b: 'Wants and entertainment',
    option_c: 'Savings and debt repayment',
    option_d: 'Luxury vacations',
    correct_option: 'C',
    explanation: 'The rule prescribes 50% for Needs, 30% for Wants, and 20% for Savings and debt reduction.',
    difficulty: 'hard'
  },

  // --- 10. Funny & Random ---
  {
    topic: 'Funny & Random',
    question: 'What gets wetter and wetter the more it dries?',
    option_a: 'A sponge',
    option_b: 'A towel',
    option_c: 'A cloud',
    option_d: 'A bucket',
    correct_option: 'B',
    explanation: 'A towel absorbs water to dry other objects, hence it gets wetter the more it dries!',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'What has keys but cannot open any door?',
    option_a: 'A piano',
    option_b: 'A safe box',
    option_c: 'A keyring',
    option_d: 'A padlock',
    correct_option: 'A',
    explanation: 'A piano has musical keys (black and white) but cannot unlock any door.',
    difficulty: 'easy'
  },
  {
    topic: 'Funny & Random',
    question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
    option_a: 'A whistle',
    option_b: 'An echo',
    option_c: 'A kite',
    option_d: 'A cloud',
    correct_option: 'B',
    explanation: 'An echo reflects sound waves back, speaking without a physical mouth.',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'If you have me, you want to share me. If you share me, you haven\'t got me. What am I?',
    option_a: 'A secret',
    option_b: 'Money',
    option_c: 'A joke',
    option_d: 'A photo',
    correct_option: 'A',
    explanation: 'Once a secret is shared with everyone, it is no longer a secret!',
    difficulty: 'medium'
  },
  {
    topic: 'Funny & Random',
    question: 'A farmer had 17 sheep, and all but 9 died. How many live sheep does the farmer have left?',
    option_a: '8',
    option_b: '9',
    option_c: '0',
    option_d: '17',
    correct_option: 'B',
    explanation: 'Carefully read the phrasing: "all but 9 died", meaning exactly 9 survived!',
    difficulty: 'hard'
  }
];

export function getRandomQuestionForTopic(
  topicName: string,
  difficulty?: 'easy' | 'medium' | 'hard',
  excludeQuestions: string[] = []
): BankQuestion {
  // Normalize topic comparison
  let candidates = QUESTION_BANK.filter(
    (q) => q.topic.toLowerCase().trim() === topicName.toLowerCase().trim()
  );

  if (candidates.length === 0) {
    // If exact name didn't match, check partial inclusion
    candidates = QUESTION_BANK.filter(
      (q) => topicName.toLowerCase().includes(q.topic.toLowerCase()) ||
             q.topic.toLowerCase().includes(topicName.toLowerCase())
    );
  }

  if (candidates.length === 0) {
    // Fall back to entire bank if topic is unknown
    candidates = QUESTION_BANK;
  }

  // Filter out questions already used if possible
  const unused = candidates.filter((q) => !excludeQuestions.includes(q.question));
  const pool = unused.length > 0 ? unused : candidates;

  // Filter by difficulty if provided
  if (difficulty) {
    const diffPool = pool.filter((q) => q.difficulty === difficulty);
    if (diffPool.length > 0) {
      return diffPool[Math.floor(Math.random() * diffPool.length)];
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

