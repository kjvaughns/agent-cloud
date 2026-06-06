# Polish recent GitHub commits

I reviewed the last ~30 commits. The big external merge (`eec873a` — commission calculator, policy editing, carrier auto-detection, contract delete, AgentLink 8-phase dialog) landed cleanly for almost everything (migration applied, `discord-notify.server.ts` exists, `commission_schedule` has the new `advance_pct` / `commission_pct` columns, finances enrichment + `deleteContractRequest` look good), **but it broke `src/components/pipeline/client-detail-drawer.tsx`** in two ways that will prevent the file from compiling/running.

## Bugs to fix

### 1. Duplicate `useNavigate` import (build error)
```tsx
// lines 3 and 5 of src/components/pipeline/client-detail-drawer.tsx
import { useNavigate } from "@tanstack/react-router";   // line 3
import { useEffect, useMemo, useState } from "react";   // line 4
import { useNavigate } from "@tanstack/react-router";   // line 5 ← duplicate
```
Remove line 5.

### 2. `markClientSold` used but never imported (runtime ReferenceError)
The merge added a Mark-Sold button in `DrawerHeader` calling `useServerFn(markClientSold)`, but `markClientSold` is not in the import list from `@/lib/pipeline.functions` (it does exist there as an exported server fn). Add it to the existing import:

```tsx
import {
  getClientDetail, touchLastOpened, updateClient, upsertFinancials,
  saveBeneficiary, deleteBeneficiary, addLifeEvent, deleteLifeEvent,
  logContact, saveNeedsAnswer, scheduleEvent, upsertClientHealth, upsertClientBanking,
  listCarriers, addPolicy, updatePolicy, markClientSold,   // ← add
} from "@/lib/pipeline.functions";
```

## Polish (light)

- Nothing else in the merge needs changes. The AgentLink dialog rewrite, `PolicyRow` inline editor, finances carrier/writing-agent enrichment, `deleteContractRequest` + trash button, commission-calculator + Discord notify path, and the migration all look consistent with the rest of the codebase.

## Verification

After the two edits I'll let the harness run the typecheck/build to confirm the drawer compiles and the Pipeline → client drawer renders again.
