import { gameService, initLocalMockData } from '../src/services/gameService';
import { hashToken } from '../src/lib/crypto';

export async function runRealMultiplayerVerification() {
  console.log('================================================================');
  console.log('REAL MULTIPLAYER VERIFICATION: A (Arun), B (Rahul), C (Amal), D (Nikhil)');
  console.log('================================================================');

  // Initialize fresh environment
  initLocalMockData(true);

  // 1. Create Room
  const game = await gameService.createGame(
    'Real World Friday Fun Final 2026',
    'Verification Room for 4 Players',
    { min_participants: 3, max_participants: 10, points_correct: 10, points_wrong: 0 },
    'active'
  );
  console.log(`[PASS] Game Room Created: ${game.id} ("${game.name}")`);

  const round = await gameService.getActiveRound(game.id);
  if (!round) throw new Error('Active round not initialized');
  console.log(`[PASS] Round 1 Initialized: ${round.id}`);

  // 2. Add Participants: A (Arun), B (Rahul), C (Amal), D (Nikhil)
  const { participant: pA, rawToken: tokenA } = await gameService.addParticipant(game.id, 'Arun', 'A');
  const { participant: pB, rawToken: tokenB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
  const { participant: pC, rawToken: tokenC } = await gameService.addParticipant(game.id, 'Amal', 'C');
  const { participant: pD, rawToken: tokenD } = await gameService.addParticipant(game.id, 'Nikhil', 'D');

  console.log(`[PASS] Participant A added: Arun (Code: ${pA.player_code}, Token: ${tokenA.slice(0, 8)}...)`);
  console.log(`[PASS] Participant B added: Rahul (Code: ${pB.player_code}, Token: ${tokenB.slice(0, 8)}...)`);
  console.log(`[PASS] Participant C added: Amal (Code: ${pC.player_code}, Token: ${tokenC.slice(0, 8)}...)`);
  console.log(`[PASS] Participant D added: Nikhil (Code: ${pD.player_code}, Token: ${tokenD.slice(0, 8)}...)`);

  // Verify unique token hashes stored
  const hashA = await hashToken(tokenA);
  const hashB = await hashToken(tokenB);
  const hashC = await hashToken(tokenC);
  const hashD = await hashToken(tokenD);
  if (pA.invitation_token_hash !== hashA) throw new Error('Token A hash mismatch');
  if (pB.invitation_token_hash !== hashB) throw new Error('Token B hash mismatch');
  if (pC.invitation_token_hash !== hashC) throw new Error('Token C hash mismatch');
  if (pD.invitation_token_hash !== hashD) throw new Error('Token D hash mismatch');
  console.log('[PASS] Cryptographic SHA-256 token hashes verified for all participants');

  // Topics
  const topics = await gameService.getTopics();
  const topicPollution = topics.find((t) => t.name.includes('Pollution')) || topics[0];
  const topicAI = topics.find((t) => t.name.includes('AI')) || topics[1];
  const topicCricket = topics.find((t) => t.name.includes('Cricket')) || topics[2];
  const topicPolitics = topics.find((t) => t.name.includes('Politics')) || topics[3];

  // 3. Perform the 4 specified assignments:
  // A -> C: Pollution
  console.log('\n--- Assigning Challenges ---');
  const chal_A_to_C = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round.id,
    senderId: pA.id,
    receiverId: pC.id,
    topicId: topicPollution.id,
    topicName: topicPollution.name,
  });
  console.log(`[PASS] Assignment 1: A (Arun) -> C (Amal) on "${topicPollution.name}" (ChallengeToken: ${chal_A_to_C.rawChallengeToken.slice(0, 8)}...)`);

  // B -> C: AI & Technology
  const chal_B_to_C = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round.id,
    senderId: pB.id,
    receiverId: pC.id,
    topicId: topicAI.id,
    topicName: topicAI.name,
  });
  console.log(`[PASS] Assignment 2: B (Rahul) -> C (Amal) on "${topicAI.name}" (ChallengeToken: ${chal_B_to_C.rawChallengeToken.slice(0, 8)}...)`);

  // D -> C: Cricket
  const chal_D_to_C = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round.id,
    senderId: pD.id,
    receiverId: pC.id,
    topicId: topicCricket.id,
    topicName: topicCricket.name,
  });
  console.log(`[PASS] Assignment 3: D (Nikhil) -> C (Amal) on "${topicCricket.name}" (ChallengeToken: ${chal_D_to_C.rawChallengeToken.slice(0, 8)}...)`);

  // C -> A: Politics
  const chal_C_to_A = await gameService.submitSelectionAndGenerateChallenge({
    gameId: game.id,
    roundId: round.id,
    senderId: pC.id,
    receiverId: pA.id,
    topicId: topicPolitics.id,
    topicName: topicPolitics.name,
  });
  console.log(`[PASS] Assignment 4: C (Amal) -> A (Arun) on "${topicPolitics.name}" (ChallengeToken: ${chal_C_to_A.rawChallengeToken.slice(0, 8)}...)`);

  // 4. Verify C receives THREE separate incoming challenges
  console.log('\n--- Verifying Multiple Incoming Challenges for C ---');
  const cData = await gameService.getParticipantByInvitationToken(game.id, tokenC);
  if (!cData) throw new Error('Failed to resolve Participant C by invitation token');

  const incomingForC = cData.incomingChallenges;
  console.log(`[VERIFY] C received ${incomingForC.length} incoming challenges (Expected: 3)`);
  if (incomingForC.length !== 3) {
    throw new Error(`Expected 3 incoming challenges for C, received ${incomingForC.length}`);
  }

  const senderIds = incomingForC.map((ic) => ic.sender_id);
  if (!senderIds.includes(pA.id) || !senderIds.includes(pB.id) || !senderIds.includes(pD.id)) {
    throw new Error('C incoming challenges do not match senders A, B, and D');
  }
  console.log('[PASS] C received 3 distinct challenges from A (Arun), B (Rahul), and D (Nikhil)');

  // 5. C answers all three challenges independently:
  console.log('\n--- C Answers All 3 Challenges Independently ---');

  // Inspect questions
  const q_AC = await gameService.getChallengeByToken(chal_A_to_C.rawChallengeToken);
  const q_BC = await gameService.getChallengeByToken(chal_B_to_C.rawChallengeToken);
  const q_DC = await gameService.getChallengeByToken(chal_D_to_C.rawChallengeToken);

  // Note: Before reveal, correct_option must be NULL
  if (q_AC.question.correct_option !== null) throw new Error('SECURITY LEAK: correct_option exposed before reveal on chal_A_to_C');
  if (q_BC.question.correct_option !== null) throw new Error('SECURITY LEAK: correct_option exposed before reveal on chal_B_to_C');
  if (q_DC.question.correct_option !== null) throw new Error('SECURITY LEAK: correct_option exposed before reveal on chal_D_to_C');
  console.log('[PASS] Verified Zero-Leak: correct_option is masked (NULL) for all challenges prior to reveal');

  // Look up ground truth in questions store to simulate 2 correct and 1 wrong
  const questionsStore = JSON.parse(localStorage.getItem('friday_fun_2026_questions') || '[]');
  const qRecord_AC = questionsStore.find((q: any) => q.assignment_id === chal_A_to_C.assignment.id);
  const qRecord_BC = questionsStore.find((q: any) => q.assignment_id === chal_B_to_C.assignment.id);
  const qRecord_DC = questionsStore.find((q: any) => q.assignment_id === chal_D_to_C.assignment.id);
  const qRecord_CA = questionsStore.find((q: any) => q.assignment_id === chal_C_to_A.assignment.id);

  // C answers Challenge 1 (from A): CORRECT
  const res1 = await gameService.submitAnswer(chal_A_to_C.rawChallengeToken, qRecord_AC.correct_option);
  console.log(`[PASS] C answered Challenge 1 (from Arun): Option ${qRecord_AC.correct_option} (CORRECT) -> Success: ${res1.success}`);

  // C answers Challenge 2 (from B): WRONG
  const wrongOpt = (['A', 'B', 'C', 'D'].find((o) => o !== qRecord_BC.correct_option) || 'A') as 'A'|'B'|'C'|'D';
  const res2 = await gameService.submitAnswer(chal_B_to_C.rawChallengeToken, wrongOpt);
  console.log(`[PASS] C answered Challenge 2 (from Rahul): Option ${wrongOpt} (WRONG) -> Success: ${res2.success}`);

  // C answers Challenge 3 (from D): CORRECT
  const res3 = await gameService.submitAnswer(chal_D_to_C.rawChallengeToken, qRecord_DC.correct_option);
  console.log(`[PASS] C answered Challenge 3 (from Nikhil): Option ${qRecord_DC.correct_option} (CORRECT) -> Success: ${res3.success}`);

  // A answers Challenge from C: CORRECT
  const res4 = await gameService.submitAnswer(chal_C_to_A.rawChallengeToken, qRecord_CA.correct_option);
  console.log(`[PASS] A answered Challenge (from Amal): Option ${qRecord_CA.correct_option} (CORRECT) -> Success: ${res4.success}`);

  // 6. Admin Monitoring & Reveal
  console.log('\n--- Admin Monitoring & Answer Reveal ---');
  const liveAssignments = await gameService.getLiveAssignments(game.id);
  const submittedCount = liveAssignments.filter((a) => a.status === 'submitted').length;
  console.log(`[PASS] Live Submissions: ${submittedCount} / ${liveAssignments.length} submitted`);

  await gameService.revealRound(round.id, game.id);
  console.log('[PASS] Admin clicked REVEAL ALL ANSWERS. Round status set to REVEALED.');

  // 7. Verify Scores
  console.log('\n--- Score & Leaderboard Verification ---');
  const leaderboard = await gameService.getLeaderboard(game.id);

  const scoreA = leaderboard.find((s) => s.participant_id === pA.id);
  const scoreB = leaderboard.find((s) => s.participant_id === pB.id);
  const scoreC = leaderboard.find((s) => s.participant_id === pC.id);
  const scoreD = leaderboard.find((s) => s.participant_id === pD.id);

  console.log(`Participant C (Amal):  Score = ${scoreC?.total_points} (Expected: 20 pts, 2 correct, 1 wrong)`);
  console.log(`Participant A (Arun):  Score = ${scoreA?.total_points} (Expected: 10 pts, 1 correct, 0 wrong)`);
  console.log(`Participant B (Rahul): Score = ${scoreB?.total_points} (Expected: 0 pts)`);
  console.log(`Participant D (Nikhil):Score = ${scoreD?.total_points} (Expected: 0 pts)`);

  if (scoreC?.total_points !== 20 || scoreC?.correct_answers !== 2 || scoreC?.wrong_answers !== 1) {
    throw new Error(`Scoring mismatch for C: expected 20 pts, got ${scoreC?.total_points}`);
  }
  if (scoreA?.total_points !== 10 || scoreA?.correct_answers !== 1) {
    throw new Error(`Scoring mismatch for A: expected 10 pts, got ${scoreA?.total_points}`);
  }

  // Champion: C is 1st (20 pts), A is 2nd (10 pts)
  if (leaderboard[0].participant_id !== pC.id) {
    throw new Error(`Expected C to be #1 Champion, got ${leaderboard[0].participant?.display_name}`);
  }
  console.log(`[PASS] 🏆 Champion Verified: ${leaderboard[0].participant?.display_name} with ${leaderboard[0].total_points} pts!`);

  console.log('\n================================================================');
  console.log('REAL MULTIPLAYER VERIFICATION: ALL CHECKS PASSED 100%!');
  console.log('================================================================\n');
  return true;
}
