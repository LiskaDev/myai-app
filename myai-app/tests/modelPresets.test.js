import { describe, expect, it } from 'vitest';
import {
    MODEL_PRESETS,
    migrateDeprecatedModelId,
} from '../src/composables/presets.js';

function presetValues() {
    return MODEL_PRESETS.flatMap(group => group.models.map(model => model.value));
}

describe('model presets migration', () => {
    it('uses the current DeepSeek official and SiliconFlow model IDs', () => {
        const values = presetValues();

        expect(values).toContain('deepseek-flash');
        expect(values).toContain('deepseek-v4-pro');
        expect(values).toContain('deepseek-ai/DeepSeek-V4-Flash');
        expect(values).toContain('deepseek-ai/DeepSeek-V4-Pro');
    });

    it('removes retired DeepSeek and vision entries from both shared selectors', () => {
        const values = presetValues();

        expect(values).not.toContain('deepseek-v4-flash');
        expect(values).not.toContain('deepseek-v4-flash-vision-exp');
        expect(values).not.toContain('deepseek-ai/DeepSeek-R1');
        expect(values).not.toContain('deepseek-ai/DeepSeek-V3');
        expect(values).not.toContain('deepseek-ai/DeepSeek-R1-0528');
    });

    it('migrates saved main/background selections without changing provider', () => {
        expect(migrateDeprecatedModelId('deepseek-v4-flash')).toBe('deepseek-flash');
        expect(migrateDeprecatedModelId('deepseek-v4-flash-vision-exp')).toBe('deepseek-flash');
        expect(migrateDeprecatedModelId('deepseek-ai/DeepSeek-V3'))
            .toBe('deepseek-ai/DeepSeek-V4-Flash');
        expect(migrateDeprecatedModelId('deepseek-ai/DeepSeek-R1-0528'))
            .toBe('deepseek-ai/DeepSeek-V4-Pro');
        expect(migrateDeprecatedModelId('custom/model')).toBe('custom/model');
    });
});
