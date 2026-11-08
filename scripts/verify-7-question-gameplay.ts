/**
 * FRIDAY FUN GAME 2026 - 7-QUESTION GAMEPLAY & PROGRESSION QA SUITE
 * Validates sequential question progression, 7 questions per topic, refresh & resume,
 * zero-leak security, duplicate rejection, and 70-point scoring.
 */
import { gameService } from '../src/services/gameService';
import { generateQuestionSetForTopic } from '../src/services/questionGenerator';

async function runTestSuite() {
  console.log('================================================================');
  console.log('FRIDAY FUN 2026: 7-QUESTION GAMEPLAY & PROGRESSION VERIFICATION');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      if (detail) console.error(`    Detail: ${detail}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // TEST 1: Question Generator creates 7 questions with 3 Easy, 3 Medium, 1 Hard
  console.log('[TEST 1] AI/Question Generator - 7-Question Topic Set & Difficulty');
  const generatedSet = await generateQuestionSetForTopic('Movies & Entertainment', 7, { easy: 3, medium: 3, hard: 1 });
  assert(generatedSet.length === 7, 'Generates exactly 7 questions for Movies & Entertainment');
  
  const easyCount = generatedSet.filter((q) => q.difficulty === 'easy').length;
  const medCount = generatedSet.filter((q) => q.difficulty === 'medium').length;
  const hardCount = generatedSet.filter((q) => q.difficulty === 'hard').length;
  assert(easyCount === 3, 'Contains exactly 3 Easy questions', `Got ${easyCount}`);
  assert(medCount === 3, 'Contains exactly 3 Medium questions', `Got ${medCount}`);
  assert(hardCount === 1, 'Contains exactly 1 Hard question', `Got ${hardCount}`);

  // Distinct options & non-empty
  const distinctQuestions = new Set(generatedSet.map((q) => q.question.toLowerCase().trim()));
  assert(distinctQuestions.size === 7, 'All 7 questions in the set are completely distinct');
  for (const q of generatedSet) {
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
    const uniqueOpts = new Set(opts);
    assert(uniqueOpts.size === 4, `All 4 options distinct for question: "${q.question.substring(0, 30)}..."`);
    assert(['A', 'B', 'C', 'D'].includes(q.correct_option), 'Valid correct_option (A/B/C/D)');
  }

  // TEST 2: Game Setup with 4 Participants (Arun, Rahul, Amal, Nikhil)
  console.log('\n[TEST 2] Game Room & Participant Setup');
  const game = await gameService.createGame(
    'FRIDAY FUN – 7-QUESTION QA VERIFICATION ROOM',
    'Real Gameplay QA Verification',
    { points_correct: 10, points_wrong: 0 }
  );
  assert(Boolean(game.id), 'Created QA Game Room', `Game ID: ${game.id}`);

  const round = await gameService.getActiveRound(game.id);
  assert(Boolean(round?.id), 'Game Round 1 initialized active');

  const { participant: pA } = await gameService.addParticipant(game.id, 'Arun', 'A');
  const { participant: pB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
  const { participant: pC } = await gameService.addParticipant(game.id, 'Amal', 'C');
  const { participant: pD } = await gameService.addParticipant(game.id, 'Nikhil', 'D');

  assert(pA.player_code === 'A' && pB.player_code === 'B' && pC.player_code === 'C' && pD.player_code === 'D', 'All 4 participants registered with unique player codes');

  const topics = await gameService.getTopics();
  const moviesTopic = topics.find((t) => t.name.includes('Movies')) || topics[0];
  const sportsTopic = topics.find((t) => t.name.includes('Cricket')) || topics[1];
  const techTopic = topics.find((t) => t.name.includes('AI')) || topics[2];

  // TEST 3: Challenge Creation allocates 7 sequential questions
  console.log('\n[TEST 3] Challenge Allocation: Arun (A) challenges Rahul (B) on Movies & Entertainment');
  const challengeAB = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round!.id,
    senderId: pA.id,
    receiverId: pB.id,
    topicId: moviesTopic.id,
    topicName: moviesTopic.name,
  });

  assert(Boolean(challengeAB.rawChallengeToken), 'Generated secure challenge token for Rahul');

  // Load challenge via token
  const loadedChallenge = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(Boolean(loadedChallenge), 'Challenge loaded successfully via secure token');
  assert(Array.isArray(loadedChallenge.questions), 'Payload includes questions array');
  assert(loadedChallenge.questions.length === 7, `Challenge has exactly 7 questions (got ${loadedChallenge.questions.length})`);
  assert(loadedChallenge.assignment.total_questions === 7, 'Assignment total_questions recorded as 7');
  assert(loadedChallenge.progress.total === 7, 'Progress total is 7');
  assert(loadedChallenge.progress.answered === 0, 'Initial answered count is 0');
  assert(loadedChallenge.progress.is_completed === false, 'Challenge status is not completed initially');

  // Verify Zero-Leak Answer Security before reveal
  for (let i = 0; i < loadedChallenge.questions.length; i++) {
    const q = loadedChallenge.questions[i];
    assert(q.sequence_num === i + 1, `Question ${i + 1} has sequence_num ${i + 1}`);
    assert(q.correct_option === null, `Zero-leak: Question ${i + 1} correct_option is null before reveal`);
    assert(q.explanation === null, `Zero-leak: Question ${i + 1} explanation is null before reveal`);
  }

  // TEST 4: Sequential Answering - Questions 1, 2, 3
  console.log('\n[TEST 4] Sequential Answering: Rahul answers Q1, Q2, Q3');
  const q1 = loadedChallenge.questions[0];
  const q2 = loadedChallenge.questions[1];
  const q3 = loadedChallenge.questions[2];
  const q4 = loadedChallenge.questions[3];

  const ans1 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'A', q1.id);
  assert(ans1.success === true, 'Rahul successfully answered Question 1');
  assert(ans1.is_completed === false, 'Challenge remains incomplete after Question 1');

  const afterQ1 = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(afterQ1.answers.length === 1, 'Answers array has 1 entry after Q1');
  assert(afterQ1.assignment.status === 'opened', 'Challenge assignment status is opened, not submitted');

  const ans2 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'B', q2.id);
  assert(ans2.success === true, 'Rahul successfully answered Question 2');
  assert(ans2.is_completed === false, 'Challenge remains incomplete after Question 2');

  const ans3 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'C', q3.id);
  assert(ans3.success === true, 'Rahul successfully answered Question 3');
  assert(ans3.is_completed === false, 'Challenge remains incomplete after Question 3');

  const afterQ3 = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(afterQ3.answers.length === 3, 'Answers array has 3 entries after Q3');

  // TEST 5: Refresh & Resume at Question 4
  console.log('\n[TEST 5] Refresh & Resume Simulation at Question 4');
  // Re-fetch challenge as if browser refreshed F5
  const refreshedChallenge = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(refreshedChallenge.answers.length === 3, 'Refreshed state retains 3 submitted answers');
  
  // Find first unanswered index
  const nextUnansweredIndex = refreshedChallenge.questions.findIndex(
    (q: any) => !refreshedChallenge.answers.some((a: any) => a.question_id === q.id)
  );
  assert(nextUnansweredIndex === 3, `Auto-resume seeks directly to Question index 3 (Question 4 of 7), got ${nextUnansweredIndex}`);

  // TEST 6: Duplicate Answer Prevention
  console.log('\n[TEST 6] Duplicate Answer Submission Prevention');
  const duplicateSubmission = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'D', q2.id);
  assert(duplicateSubmission.success === false, 'Duplicate answer for Question 2 rejected');
  assert(
    Boolean(duplicateSubmission.error && duplicateSubmission.error.includes('already been submitted')),
    'Rejection message indicates answer already submitted',
    duplicateSubmission.error
  );

  // TEST 7: Complete Remaining Questions (Q4 to Q7)
  console.log('\n[TEST 7] Answering Remaining Questions 4, 5, 6, 7');
  const q5 = loadedChallenge.questions[4];
  const q6 = loadedChallenge.questions[5];
  const q7 = loadedChallenge.questions[6];

  const ans4 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'A', q4.id);
  assert(ans4.success === true && ans4.is_completed === false, 'Answered Question 4');

  const ans5 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'B', q5.id);
  assert(ans5.success === true && ans5.is_completed === false, 'Answered Question 5');

  const ans6 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'C', q6.id);
  assert(ans6.success === true && ans6.is_completed === false, 'Answered Question 6');

  const ans7 = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'D', q7.id);
  assert(ans7.success === true, 'Answered final Question 7');
  assert(ans7.is_completed === true, 'Final answer marks challenge as completed!');

  const finalChallenge = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(finalChallenge.assignment.status === 'submitted', 'Assignment status is submitted after 7 answers');
  assert(finalChallenge.answers.length === 7, 'All 7 answers recorded');
  assert(finalChallenge.progress.is_completed === true, 'Progress is_completed is true');

  // Attempting to answer again after completion
  const postCompleteAttempt = await gameService.submitAnswer(challengeAB.rawChallengeToken, 'A', q1.id);
  assert(postCompleteAttempt.success === false, 'Post-completion submission blocked');

  // TEST 8: Multiple Participants challenging Participant C (Amal)
  console.log('\n[TEST 8] Multiple Challengers targeting Participant C (Amal)');
  const challengeAC = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round!.id,
    senderId: pA.id,
    receiverId: pC.id,
    topicId: moviesTopic.id,
    topicName: moviesTopic.name,
  });
  const challengeBC = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round!.id,
    senderId: pB.id,
    receiverId: pC.id,
    topicId: sportsTopic.id,
    topicName: sportsTopic.name,
  });
  const challengeDC = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round!.id,
    senderId: pD.id,
    receiverId: pC.id,
    topicId: techTopic.id,
    topicName: techTopic.name,
  });

  const incomingToC = await gameService.getIncomingChallenges(pC.id, game.id);
  assert(incomingToC.length === 3, `Amal has 3 distinct incoming challenges from A, B, and D (got ${incomingToC.length})`);

  // Verify each incoming challenge has 7 questions
  const loadedAC = await gameService.getChallengeByToken(challengeAC.rawChallengeToken);
  const loadedBC = await gameService.getChallengeByToken(challengeBC.rawChallengeToken);
  const loadedDC = await gameService.getChallengeByToken(challengeDC.rawChallengeToken);
  assert(loadedAC.questions.length === 7, 'Challenge AC has 7 questions');
  assert(loadedBC.questions.length === 7, 'Challenge BC has 7 questions');
  assert(loadedDC.questions.length === 7, 'Challenge DC has 7 questions');

  // TEST 9: Reveal and Scoring Calculation
  console.log('\n[TEST 9] Round Reveal & Scoring Calculation (Max 70 points)');
  await gameService.revealRound(round!.id, game.id);

  const revealedChallenge = await gameService.getChallengeByToken(challengeAB.rawChallengeToken);
  assert(revealedChallenge.round.is_revealed === true, 'Round is marked revealed');

  // After reveal, correct_option and explanation are exposed
  for (let i = 0; i < revealedChallenge.questions.length; i++) {
    const q = revealedChallenge.questions[i];
    assert(['A', 'B', 'C', 'D'].includes(q.correct_option), `Question ${i + 1} correct_option exposed after reveal: ${q.correct_option}`);
    assert(Boolean(q.explanation), `Question ${i + 1} explanation exposed after reveal`);
  }

  // Verify Leaderboard
  const leaderboard = await gameService.getLeaderboard(game.id);
  const scoreB = leaderboard.find((s) => s.participant_id === pB.id);
  assert(Boolean(scoreB), 'Rahul appears on Leaderboard');
  console.log(`  Leaderboard Score for Rahul: ${scoreB?.total_points} points (${scoreB?.correct_answers} correct out of 7)`);
  assert(scoreB!.total_points <= 70 && scoreB!.total_points >= 0, 'Total points within valid range [0, 70]');

  console.log('\n================================================================');
  console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests} assertions)`);
  console.log('================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\nFATAL ERROR DURING TEST EXECUTION:', err);
  process.exit(1);
});
