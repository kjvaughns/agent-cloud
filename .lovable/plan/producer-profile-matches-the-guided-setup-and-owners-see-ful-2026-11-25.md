# Producer Profile matches the guided setup, and owners see full agent details on contract requests

## 1. Producer Profile has everything from the guided setup
Every step of the guided setup (About you, Your license, Home address, ID & SSN, E&O, AML, Background, Sign) can also be viewed and edited on the Producer Profile page, in the same order.

- **Signature section** (new, at the bottom of the page): shows the signature typed during onboarding, the date it was signed and the agreement version. If they haven't signed yet, or want to sign again, they can type their full legal name and agree, the same way as in setup.
- **Background questions** move from their own tab onto the same page, as a section above the signature. They are the same 19 questions, with "Set all to No".
- Integrations stays as its own tab. The page becomes one list of sections, and the checklist at the top jumps to whichever one is missing.

## 2. Owners see everything under Contract Requests
Your agency's contract requests list already includes every request from every agent: 61 requests for 18 agents. What's missing is the agent's full details while you work a request.

- **Agent page in Contract Requests:** add a "Producer file" section showing everything the agent entered:
  - personal info, address and NPN
  - SSN, with the same logged Reveal button
  - driver's license number, state and expiry, with front and back photos
  - E&O and AML certificates
  - background answers, with any "yes" answers highlighted
  - signature
- **Single request page:** add a "View producer file" button that opens the same details in a side panel. You can copy what you need for the carrier without leaving the request.
- Only the agency owner and staff with contracting access see this. These are the same people who can see the Producer file under Team today.

## Technical details
- Reuse `ProducerFileView` and `getProducerFile`, which already check owner and contracting permissions.
- Move `BackgroundTab` into the profile's sections. Add a `SignatureSection` that reuses the existing `signBackgroundDisclosure` / agreement save from the setup Sign step.
- Old `?tab=background` links scroll to that section.
- Contract request agent page (`agent.$agentId.tsx`): add the producer file section. Request page (`$requestId.tsx`): add a Sheet with `ProducerFileView`.
