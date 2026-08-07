import anyAscii from 'any-ascii';
import { remove as removeConfusables } from 'confusables';

/**
 * VRChat names are frequently written in decorative Unicode, so a plain
 * substring search never finds them. Folding produces ASCII forms to search
 * against instead.
 *
 * Two forms are produced and both are indexed, so a name is findable by what
 * its characters say and by what they look like.
 *
 * 1. any-ascii alone. Handles mathematical alphanumerics (𝓝𝓸𝓬), fullwidth
 *    (ＮＯＣ), circled (Ⓝⓞⓒ) and small capitals (ɴᴏᴄ), and romanises real
 *    scripts by pronunciation.
 * 2. Shape-substituted, then any-ascii. Pronunciation is exactly wrong when a
 *    character is borrowed for its outline: 几 is a Chinese word any-ascii
 *    faithfully reads "Ji", and Armenian ռ reads "rr", when both were typed as
 *    Latin letters. Unicode's confusables table (UTS #39) covers most of that
 *    cross-script borrowing; SHAPE_ALIKE below fills the gaps it leaves in the
 *    "faux CJK" alphabet, and must run first because confusables rewrites ㄩ
 *    to a digit before the letter reading can be recovered.
 */
const SHAPE_ALIKE: Record<string, string> = {
    // Bopomofo and CJK radicals used as Latin letters.
    ㄅ: 'B',
    ㄈ: 'C',
    ㄊ: 'T',
    ㄋ: 'M',
    ㄒ: 'T',
    ㄖ: 'O',
    ㄗ: 'P',
    ㄚ: 'Y',
    ㄩ: 'U',
    ㄥ: 'L',
    丁: 'T',
    丂: 'S',
    七: 'T',
    丄: 'L',
    丩: 'J',
    丨: 'I',
    乃: 'B',
    久: 'X',
    乇: 'E',
    乙: 'Z',
    九: 'G',
    了: 'T',
    二: 'E',
    人: 'A',
    几: 'N',
    刀: 'D',
    力: 'H',
    卂: 'A',
    匕: 'K',
    匚: 'C',
    卩: 'P',
    厶: 'A',
    口: 'O',
    土: 'I',
    夕: 'Y',
    工: 'I',
    山: 'W',
    尺: 'R',
    廾: 'H',
    必: 'B',
    戊: 'K',
    日: 'B',
    木: 'K',
    水: 'X',
    火: 'H',
    爪: 'M',
    片: 'H',
    王: 'I',
    田: 'H',
    目: 'B',
    冫: 'V',
    壬: 'F',
    干: 'F',
    正: 'F',
    上: 'L'
};

/** Reduces to the characters a search can meaningfully compare. */
function toSearchable(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function applyShapeAlike(value: string): string {
    return value.replace(/./gu, (char) => SHAPE_ALIKE[char] ?? char);
}

/**
 * ASCII forms of a name, most faithful first. Empty results are dropped, so a
 * name of pure symbols contributes nothing rather than an empty key that every
 * query would match.
 */
export function foldName(name: string): string[] {
    const base = name.normalize('NFKC');
    const folded = new Set<string>();

    folded.add(toSearchable(anyAscii(base)));
    folded.add(
        toSearchable(anyAscii(removeConfusables(applyShapeAlike(base))))
    );

    folded.delete('');
    return [...folded];
}

/** Folds a query the same way, so a decorative query also matches. */
export function foldQuery(query: string): string[] {
    const direct = toSearchable(query);
    const folded = foldName(query);
    return direct ? [...new Set([direct, ...folded])] : folded;
}
