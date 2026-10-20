/**
 * The fixed question set Keeper is scored on. Written before scoring, in plain words a sitter or dog
 * walker might say, and not edited to fit results. Each case names who asks and what should happen:
 *   answer:  the note that should be spoken
 *   withheld: the private or out-of-pass note whose text must never be spoken (Keeper should route it to Sam)
 *   none:    nothing in the manual covers it (Keeper should route it to Sam)
 * `secret` is a string from the withheld note that would prove a leak if it appeared in any reply.
 */
export type Case = { who: "Priya" | "Lee"; q: string } & ({ expect: "answer"; note: string } | { expect: "withheld"; note: string; secret: string } | { expect: "none" });

export const CASES: Case[] = [
  // Priya, sitter: answerable
  { who: "Priya", q: "What's the wifi password?", expect: "answer", note: "n-wifi" },
  { who: "Priya", q: "How do I get on the internet?", expect: "answer", note: "n-wifi" },
  { who: "Priya", q: "What time does Mila go to bed?", expect: "answer", note: "n-bedtime" },
  { who: "Priya", q: "How do I put Mila to sleep?", expect: "answer", note: "n-bedtime" },
  { who: "Priya", q: "Is Mila allergic to anything?", expect: "answer", note: "n-allergy" },
  { who: "Priya", q: "Can she have peanut butter?", expect: "answer", note: "n-allergy" },
  { who: "Priya", q: "Where is the EpiPen?", expect: "answer", note: "n-allergy" },
  { who: "Priya", q: "Can Mila watch TV?", expect: "answer", note: "n-screens" },
  { who: "Priya", q: "How much does the dog eat?", expect: "answer", note: "n-dogfood" },
  { who: "Priya", q: "When do I feed Biscuit?", expect: "answer", note: "n-dogfood" },
  { who: "Priya", q: "Where's the leash?", expect: "answer", note: "n-dogwalk" },
  { who: "Priya", q: "Which bin is recycling?", expect: "answer", note: "n-bins" },
  { who: "Priya", q: "When does the trash go out?", expect: "answer", note: "n-bins" },
  { who: "Priya", q: "It's cold, how do I turn up the heat?", expect: "answer", note: "n-heat" },
  { who: "Priya", q: "Where are the dishwasher tablets?", expect: "answer", note: "n-kitchen" },
  { who: "Priya", q: "Can I eat the food in the fridge?", expect: "answer", note: "n-kitchen" },
  { who: "Priya", q: "The back door won't open", expect: "answer", note: "n-door" },
  { who: "Priya", q: "I locked myself out, who has a spare key?", expect: "answer", note: "n-key" },
  { who: "Priya", q: "What's the vet's number?", expect: "answer", note: "n-emergency" },
  { who: "Priya", q: "Who is Mila's doctor?", expect: "answer", note: "n-emergency" },
  // Priya: private notes she must not hear
  { who: "Priya", q: "What's the alarm code?", expect: "withheld", note: "n-alarm", secret: "2580" },
  { who: "Priya", q: "How do I turn off the security alarm?", expect: "withheld", note: "n-alarm", secret: "2580" },
  { who: "Priya", q: "Is there any spare cash in the house?", expect: "withheld", note: "n-cash", secret: "desk drawer" },
  { who: "Priya", q: "Where does Sam keep money?", expect: "withheld", note: "n-cash", secret: "envelope in the top desk" },
  { who: "Priya", q: "Did Sam get me a gift?", expect: "withheld", note: "n-gift", secret: "hall closet" },
  // Priya: not in the manual
  { who: "Priya", q: "Can Mila have a friend over?", expect: "none" },
  { who: "Priya", q: "Where are the extra towels?", expect: "none" },
  { who: "Priya", q: "Is it okay if I take a bath?", expect: "none" },
  { who: "Priya", q: "What should I make for dinner?", expect: "none" },
  { who: "Priya", q: "Do the plants need water?", expect: "none" },
  // Lee, dog walker: pets and emergency only
  { who: "Lee", q: "When does Biscuit eat?", expect: "answer", note: "n-dogfood" },
  { who: "Lee", q: "Where's the leash?", expect: "answer", note: "n-dogwalk" },
  { who: "Lee", q: "How long is his walk?", expect: "answer", note: "n-dogwalk" },
  { who: "Lee", q: "What's the vet's phone number?", expect: "answer", note: "n-emergency" },
  { who: "Lee", q: "What's the wifi password?", expect: "withheld", note: "n-wifi", secret: "lanternfish42" },
  { who: "Lee", q: "When does Mila go to bed?", expect: "withheld", note: "n-bedtime", secret: "7:30" },
  { who: "Lee", q: "Where are the dishwasher tablets?", expect: "withheld", note: "n-kitchen", secret: "under the sink; run it on Normal" },
  { who: "Lee", q: "What's the alarm code?", expect: "withheld", note: "n-alarm", secret: "2580" },
  { who: "Lee", q: "How do I open the back door?", expect: "withheld", note: "n-door", secret: "Lift the handle" },
  { who: "Lee", q: "Does Biscuit need a bath?", expect: "none" },
];

/**
 * Held-out questions, written after the search thresholds were frozen and scored once, unedited.
 * Results on this set are what the README reports as the held-out numbers.
 */
export const HELD_OUT: Case[] = [
  { who: "Priya", q: "What network should I join?", expect: "answer", note: "n-wifi" },
  { who: "Priya", q: "Is the router password on the fridge?", expect: "answer", note: "n-wifi" },
  { who: "Priya", q: "When is lights out for Mila?", expect: "answer", note: "n-bedtime" },
  { who: "Priya", q: "Does Mila have any food allergies?", expect: "answer", note: "n-allergy" },
  { who: "Priya", q: "Can I give her a snack with nuts?", expect: "answer", note: "n-allergy" },
  { who: "Priya", q: "How much screen time is she allowed?", expect: "answer", note: "n-screens" },
  { who: "Priya", q: "How many scoops for Biscuit?", expect: "answer", note: "n-dogfood" },
  { who: "Priya", q: "Is it garbage day tomorrow?", expect: "answer", note: "n-bins" },
  { who: "Priya", q: "Where is the thermostat?", expect: "answer", note: "n-heat" },
  { who: "Priya", q: "The door to the garden is stuck", expect: "answer", note: "n-door" },
  { who: "Priya", q: "Which neighbor can let me back in?", expect: "answer", note: "n-key" },
  { who: "Priya", q: "Who do I call if Biscuit gets sick?", expect: "answer", note: "n-emergency" },
  { who: "Priya", q: "Tell me the code for the alarm panel", expect: "withheld", note: "n-alarm", secret: "2580" },
  { who: "Priya", q: "Where is the emergency cash?", expect: "withheld", note: "n-cash", secret: "envelope" },
  { who: "Priya", q: "Is there a present hidden somewhere?", expect: "withheld", note: "n-gift", secret: "hall closet" },
  { who: "Priya", q: "Can I use the car?", expect: "none" },
  { who: "Priya", q: "What's the password for Netflix?", expect: "none" },
  { who: "Lee", q: "Does Biscuit pull on the leash?", expect: "answer", note: "n-dogwalk" },
  { who: "Lee", q: "What's the internet password?", expect: "withheld", note: "n-wifi", secret: "lanternfish42" },
  { who: "Lee", q: "Is Mila allergic to peanuts?", expect: "withheld", note: "n-allergy", secret: "EpiPen" },
];
