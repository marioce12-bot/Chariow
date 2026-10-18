import { describe, expect, it } from 'vitest';
import { validateFeedback } from './validation';
describe('validateFeedback', () => {
 it('accepts ratings 1–5 and optional trimmed suggestions', () => { expect(validateFeedback({rating:5,message:'  Très bien  '})).toEqual({rating:5,message:'Très bien'}); expect(validateFeedback({rating:3})).toEqual({rating:3,message:null}); });
 it('rejects invalid ratings, message types and oversized content', () => { for (const value of [{rating:0},{rating:6},{rating:2.5},{rating:'5'},{rating:4,message:3},{rating:1,message:'x'.repeat(2001)},null]) expect(validateFeedback(value)).toBeNull(); });
});
