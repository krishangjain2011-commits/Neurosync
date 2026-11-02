import { Category } from '../types/assessment';

export const CATEGORIES: Record<string, Category> = {
  'asd-adhd': {
    id: 'asd-adhd',
    name: 'ASD/ADHD',
    description: 'Autism Spectrum Disorder & Attention Deficit Hyperactivity Disorder Assessment',
    icon: '🧠',
    assessments: [
      {
        id: 'm-chat',
        category: 'asd-adhd',
        type: 'm-chat',
        title: 'M-CHAT',
        description: 'Modified Checklist for Autism in Toddlers',
        questions: [
          {
            id: 'q1',
            text: 'Does your child enjoy being swung, bounced on your knee, etc.?',
            type: 'yes-no',
          },
          {
            id: 'q2',
            text: 'Does your child take interest in other children?',
            type: 'yes-no',
          },
          {
            id: 'q3',
            text: 'Does your child like to climb on things, such as up stairs?',
            type: 'yes-no',
          },
          {
            id: 'q4',
            text: 'Does your child enjoy playing peek-a-boo/hide-and-seek?',
            type: 'yes-no',
          },
          {
            id: 'q5',
            text: 'Does your child ever pretend, for example, to talk on the phone or pretend to feed a doll or stuffed animal?',
            type: 'yes-no',
          },
          {
            id: 'q6',
            text: 'Does your child ever use his/her index finger to point, to ask for something?',
            type: 'yes-no',
          },
          {
            id: 'q7',
            text: 'Does your child ever use his/her index finger to point, to indicate interest in something, for example, "Look, a bird!"',
            type: 'yes-no',
          },
          {
            id: 'q8',
            text: 'Can your child play properly with small toys (e.g. cars or blocks) without just mouthing, fiddling, or dropping them?',
            type: 'yes-no',
          },
          {
            id: 'q9',
            text: 'Does your child ever bring things to you "to show" you something?',
            type: 'yes-no',
          },
          {
            id: 'q10',
            text: 'Does your child look you in the eye for more than a second or two?',
            type: 'yes-no',
          },
          {
            id: 'q11',
            text: 'Does your child seem oversensitive to noise? (e.g., plugging ears)',
            type: 'yes-no',
          },
          {
            id: 'q12',
            text: 'Does your child smile in response to your face or your smiling at him/her?',
            type: 'yes-no',
          },
          {
            id: 'q13',
            text: 'Does your child imitate you? (e.g., you make a face-will your child imitate it?)',
            type: 'yes-no',
          },
          {
            id: 'q14',
            text: 'Does your child respond to his/her name when you call?',
            type: 'yes-no',
          },
          {
            id: 'q15',
            text: 'If you point at a toy across the room, does your child look at it?',
            type: 'yes-no',
          },
          {
            id: 'q16',
            text: 'Does your child walk?',
            type: 'yes-no',
          },
          {
            id: 'q17',
            text: 'Does your child look at things you are looking at?',
            type: 'yes-no',
          },
          {
            id: 'q18',
            text: 'Does your child make unusual finger movements near his/her face?',
            type: 'yes-no',
          },
          {
            id: 'q19',
            text: 'Does your child try to attract your attention to his/her own activity?',
            type: 'yes-no',
          },
          {
            id: 'q20',
            text: 'Have you ever wondered if your child might be deaf?',
            type: 'yes-no',
          },
        ],
        scoreRange: [0, 20],
      },
    ],
  },
  'id': {
    id: 'id',
    name: 'Intellectual Disability',
    description: 'Assessment for Intellectual Disability',
    icon: '📚',
    assessments: [
      {
        id: 'glad',
        category: 'id',
        type: 'glad',
        title: 'GLAD',
        description: 'Griffiths Learning Ability Determination',
        questions: [
          {
            id: 'loc1',
            text: 'Child can lift head when lying on back',
            type: 'yes-no',
          },
          {
            id: 'loc2',
            text: 'Child can roll from back to side',
            type: 'yes-no',
          },
          {
            id: 'loc3',
            text: 'Child can sit with minimal support',
            type: 'yes-no',
          },
          {
            id: 'loc4',
            text: 'Child can crawl or move forward',
            type: 'yes-no',
          },
          {
            id: 'loc5',
            text: 'Child can stand with support',
            type: 'yes-no',
          },
          {
            id: 'ps1',
            text: 'Child responds to familiar faces',
            type: 'yes-no',
          },
          {
            id: 'ps2',
            text: 'Child shows awareness of strangers',
            type: 'yes-no',
          },
          {
            id: 'ps3',
            text: 'Child initiates simple social games',
            type: 'yes-no',
          },
          {
            id: 'ps4',
            text: 'Child cooperates in dressing',
            type: 'yes-no',
          },
          {
            id: 'ps5',
            text: 'Child understands simple instructions',
            type: 'yes-no',
          },
          {
            id: 'hear1',
            text: 'Child startles at loud sounds',
            type: 'yes-no',
          },
          {
            id: 'hear2',
            text: 'Child turns toward voice',
            type: 'yes-no',
          },
          {
            id: 'hear3',
            text: 'Child responds to own name',
            type: 'yes-no',
          },
          {
            id: 'hear4',
            text: 'Child understands simple words',
            type: 'yes-no',
          },
          {
            id: 'hear5',
            text: 'Child identifies objects by name',
            type: 'yes-no',
          },
          {
            id: 'lang1',
            text: 'Child vocalizes or coos',
            type: 'yes-no',
          },
          {
            id: 'lang2',
            text: 'Child babbles with consonant sounds',
            type: 'yes-no',
          },
          {
            id: 'lang3',
            text: 'Child uses first words',
            type: 'yes-no',
          },
          {
            id: 'lang4',
            text: 'Child combines two words',
            type: 'yes-no',
          },
          {
            id: 'lang5',
            text: 'Child follows two-step directions',
            type: 'yes-no',
          },
          {
            id: 'eye1',
            text: 'Child fixates on objects',
            type: 'yes-no',
          },
          {
            id: 'eye2',
            text: 'Child follows moving objects',
            type: 'yes-no',
          },
          {
            id: 'eye3',
            text: 'Child reaches for objects',
            type: 'yes-no',
          },
          {
            id: 'eye4',
            text: 'Child grasps objects placed in hand',
            type: 'yes-no',
          },
          {
            id: 'eye5',
            text: 'Child manipulates toys with both hands',
            type: 'yes-no',
          },
          {
            id: 'hand1',
            text: 'Child has palmar grasp',
            type: 'yes-no',
          },
          {
            id: 'hand2',
            text: 'Child has raking grasp',
            type: 'yes-no',
          },
          {
            id: 'hand3',
            text: 'Child has pincer grasp',
            type: 'yes-no',
          },
          {
            id: 'hand4',
            text: 'Child can stack blocks',
            type: 'yes-no',
          },
          {
            id: 'hand5',
            text: 'Child can draw lines',
            type: 'yes-no',
          },
        ],
        scoreRange: [0, 100],
      },
    ],
  },
  'sld': {
    id: 'sld',
    name: 'Specific Learning Disabilities',
    description: 'Assessment for Learning Disabilities',
    icon: '✏️',
    assessments: [
      {
        id: 'dyslexia',
        category: 'sld',
        type: 'dyslexia',
        title: 'Dyslexia Screening',
        description: 'Screening for Dyslexia',
        questions: [
          {
            id: 'read1',
            text: 'Child has difficulty recognizing letters',
            type: 'yes-no',
          },
          {
            id: 'read2',
            text: 'Child struggles with letter sounds (phonemes)',
            type: 'yes-no',
          },
          {
            id: 'read3',
            text: 'Child has trouble blending sounds into words',
            type: 'yes-no',
          },
          {
            id: 'read4',
            text: 'Child reads slowly or hesitantly',
            type: 'yes-no',
          },
          {
            id: 'read5',
            text: 'Child frequently misses or reverses words',
            type: 'yes-no',
          },
          {
            id: 'spell1',
            text: 'Child has difficulty spelling simple words',
            type: 'yes-no',
          },
          {
            id: 'spell2',
            text: 'Child writes letters in reverse or incorrect order',
            type: 'yes-no',
          },
          {
            id: 'spell3',
            text: 'Child omits letters when writing',
            type: 'yes-no',
          },
          {
            id: 'spell4',
            text: 'Child struggles with sight words',
            type: 'yes-no',
          },
          {
            id: 'spell5',
            text: 'Child has inconsistent spelling of the same word',
            type: 'yes-no',
          },
          {
            id: 'motor1',
            text: 'Child has poor handwriting legibility',
            type: 'yes-no',
          },
          {
            id: 'motor2',
            text: 'Child has difficulty with pencil grip',
            type: 'yes-no',
          },
          {
            id: 'motor3',
            text: 'Child struggles with letter formation',
            type: 'yes-no',
          },
          {
            id: 'motor4',
            text: 'Child fatigues easily with writing tasks',
            type: 'yes-no',
          },
          {
            id: 'motor5',
            text: 'Child shows poor coordination (fine motor skills)',
            type: 'yes-no',
          },
          {
            id: 'comprehension1',
            text: 'Child has difficulty understanding text',
            type: 'yes-no',
          },
          {
            id: 'comprehension2',
            text: 'Child struggles to recall details from stories',
            type: 'yes-no',
          },
          {
            id: 'comprehension3',
            text: 'Child has trouble with sequence or story order',
            type: 'yes-no',
          },
          {
            id: 'comprehension4',
            text: 'Child struggles with inference or prediction',
            type: 'yes-no',
          },
          {
            id: 'comprehension5',
            text: 'Child has vocabulary below grade level',
            type: 'yes-no',
          },
          {
            id: 'phonological1',
            text: 'Child has difficulty with rhyming',
            type: 'yes-no',
          },
          {
            id: 'phonological2',
            text: 'Child struggles with syllable segmentation',
            type: 'yes-no',
          },
          {
            id: 'phonological3',
            text: 'Child has trouble identifying initial sounds',
            type: 'yes-no',
          },
          {
            id: 'phonological4',
            text: 'Child struggles with sound substitution',
            type: 'yes-no',
          },
          {
            id: 'phonological5',
            text: 'Child has family history of dyslexia/reading problems',
            type: 'yes-no',
          },
        ],
        scoreRange: [0, 50],
      },
    ],
  },
};
