"""
MediTriage AI — Modular Chief Complaint Text Processor
Processes multilingual presenting complaints in English, Telugu Script, and Telugu Transliteration.
Extracts clinically reviewed symptom concepts with contextual distinction:
- Positive (active finding)
- Negated (denied finding)
- Uncertain (suspected/ambiguous)
- Historical (past/resolved episode)

Preserves patient's original wording verbatim and flags low-confidence language for nurse review.
"""

import re
import unicodedata
from enum import Enum
from typing import List, Dict, Optional, Any, Set
from pydantic import BaseModel, Field

from app.nlp.symptom_dictionary import (
    SYMPTOM_DICTIONARY,
    NEGATIONS_ENGLISH,
    NEGATIONS_TELUGU_SCRIPT,
    NEGATIONS_TELUGU_TRANSLIT,
    UNCERTAINTY_ENGLISH,
    UNCERTAINTY_TELUGU,
    HISTORICAL_ENGLISH,
    HISTORICAL_TELUGU,
    RED_FLAG_CONCEPTS,
)


class LanguageFormat(str, Enum):
    ENGLISH = "English"
    TELUGU_SCRIPT = "Telugu (Telugu Script)"
    TELUGU_TRANSLITERATION = "Telugu (Latin Transliteration)"
    AMBIGUOUS_OR_UNSUPPORTED = "Ambiguous / Unsupported"


class SymptomContext(str, Enum):
    POSITIVE = "POSITIVE"          # Actively reported present
    NEGATED = "NEGATED"            # Explicitly denied ("no chest pain", "gunde noppi ledu")
    UNCERTAIN = "UNCERTAIN"        # Unconfirmed / suspected ("maybe had seizure")
    HISTORICAL = "HISTORICAL"      # Past or resolved episode ("had fever last week")


class ExtractedSymptomConcept(BaseModel):
    concept: str = Field(..., description="Standardized clinical concept identifier")
    matched_term: str = Field(..., description="Actual token or phrase found in text")
    context: SymptomContext = Field(..., description="Contextual polarity: POSITIVE, NEGATED, UNCERTAIN, or HISTORICAL")
    language_format: LanguageFormat
    is_red_flag: bool = False
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class ProcessedComplaint(BaseModel):
    original_complaint: str = Field(..., description="Original complaint preserved verbatim without modification")
    normalized_text: str = Field(..., description="Whitespace and punctuation normalized text")
    detected_language: LanguageFormat
    extracted_symptoms: List[ExtractedSymptomConcept]
    positive_concepts: List[str] = Field(default_factory=list, description="Concepts confirmed as actively positive")
    negated_concepts: List[str] = Field(default_factory=list, description="Concepts explicitly denied or absent")
    uncertain_concepts: List[str] = Field(default_factory=list, description="Concepts with clinical uncertainty")
    historical_concepts: List[str] = Field(default_factory=list, description="Concepts from past/resolved history")
    red_flag_triggers: List[str] = Field(default_factory=list, description="Red flag triggers derived ONLY from positive concepts")
    requires_nurse_review: bool = False
    review_reason: Optional[str] = None
    clinical_disclaimer: str = (
        "CLINICAL SAFETY NOTICE: Extracted symptom concepts are assistive triage indicators "
        "and do NOT constitute a diagnosis. Staff review is mandatory."
    )


def normalize_complaint_text(text: str) -> str:
    """
    Normalizes whitespace and standardizes punctuation without removing words or meaningful negations.
    """
    if not text:
        return ""
    # Unicode normalize
    norm = unicodedata.normalize("NFKC", text)
    # Replace multiple whitespaces and newlines with a single space
    norm = re.sub(r"\s+", " ", norm).strip()
    return norm


def detect_complaint_language(text: str) -> LanguageFormat:
    """
    Detects language format based on Unicode ranges and vocabulary markers.
    Language detection is explicitly kept separate from translation.
    """
    if not text or not text.strip():
        return LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED

    clean = text.strip()

    # 1. Check for Telugu Unicode script (0x0C00 - 0x0C7F)
    has_telugu_script = any("\u0C00" <= char <= "\u0C7F" for char in clean)
    if has_telugu_script:
        return LanguageFormat.TELUGU_SCRIPT

    # 2. Check for Telugu transliteration markers in Latin script
    lower = clean.lower()
    telugu_translit_markers = {
        "noppi", "gunde", "aayasam", "ayasam", "jwaram", "jvaram", "talanoppi", "thala",
        "vantulu", "virechanalu", "raktam", "raktham", "kadupu", "potta", "kallu", "thirigi",
        "undu", "undi", "vachindi", "ledu", "ledhu", "lekapovadam", "gaali", "murcha", "dammu"
    }
    words = re.findall(r"\b[a-zA-Z]+\b", lower)
    if any(w in telugu_translit_markers for w in words):
        return LanguageFormat.TELUGU_TRANSLITERATION

    # 3. Check for English ASCII text
    # If predominantly standard ASCII alphabetic words
    ascii_words = [w for w in words if w.isascii()]
    if len(ascii_words) > 0 and len(ascii_words) >= len(words) * 0.7:
        return LanguageFormat.ENGLISH

    # 4. Fallback for unclassified scripts or symbols
    return LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED


def _find_phrase_in_text(text: str, phrase: str) -> Optional[tuple[int, int]]:
    """Finds starting and ending character index of a phrase in text (case-insensitive for Latin)."""
    t_lower = text.lower()
    p_lower = phrase.lower()
    idx = t_lower.find(p_lower)
    if idx != -1:
        return idx, idx + len(p_lower)
    return None


def _detect_context(
    text: str,
    start_idx: int,
    end_idx: int,
    lang: LanguageFormat
) -> SymptomContext:
    """
    Determines whether a matched symptom is POSITIVE, NEGATED, UNCERTAIN, or HISTORICAL.
    Inspects surrounding window of tokens restricted to the current clause.
    """
    lower_text = text.lower()
    
    # 1. Isolate the clause for pre-context and post-context
    # Clause delimiters: punctuation and coordinating conjunctions
    delimiters = [",", ";", ".", "!", "?", " but ", " however ", " while ", " and ", " కానీ ", " అయితే "]

    # Find clause start (nearest delimiter before start_idx)
    clause_start = max(0, start_idx - 60)
    for delim in delimiters:
        pos = lower_text.rfind(delim, max(0, start_idx - 60), start_idx)
        if pos != -1 and pos + len(delim) > clause_start:
            clause_start = pos + len(delim)

    # Find clause end (nearest delimiter after end_idx)
    clause_end = min(len(lower_text), end_idx + 60)
    for delim in delimiters:
        pos = lower_text.find(delim, end_idx, min(len(lower_text), end_idx + 60))
        if pos != -1 and pos < clause_end:
            clause_end = pos

    pre_clause = lower_text[clause_start:start_idx]
    post_clause = lower_text[end_idx:clause_end]

    # 1. Historical check within clause
    hist_terms = HISTORICAL_ENGLISH if lang == LanguageFormat.ENGLISH else HISTORICAL_TELUGU + HISTORICAL_ENGLISH
    for ht in hist_terms:
        if ht in pre_clause or ht in post_clause:
            return SymptomContext.HISTORICAL

    # 2. Uncertainty check within clause
    unc_terms = UNCERTAINTY_ENGLISH if lang == LanguageFormat.ENGLISH else UNCERTAINTY_TELUGU + UNCERTAINTY_ENGLISH
    for ut in unc_terms:
        if ut in pre_clause or ut in post_clause:
            return SymptomContext.UNCERTAIN

    # 3. Negation check
    # English negations typically precede symptom: "no chest pain", "denies fever"
    for neg in NEGATIONS_ENGLISH:
        pattern = rf"(^|\s){re.escape(neg)}(\s|$)"
        if re.search(pattern, pre_clause):
            return SymptomContext.NEGATED

    # Telugu script negations typically follow symptom: "గుండె నొప్పి లేదు"
    for neg in NEGATIONS_TELUGU_SCRIPT:
        if neg in post_clause or neg in pre_clause:
            return SymptomContext.NEGATED

    # Telugu transliteration negations typically follow symptom: "gunde noppi ledu"
    for neg in NEGATIONS_TELUGU_TRANSLIT:
        pattern = rf"(^|\s){re.escape(neg)}(\s|$)"
        if re.search(pattern, post_clause) or re.search(pattern, pre_clause):
            return SymptomContext.NEGATED

    return SymptomContext.POSITIVE


def process_complaint(text: str) -> ProcessedComplaint:
    """
    Main entrypoint for processing a chief complaint:
    1. Preserves original complaint verbatim.
    2. Normalizes text without losing negation keywords.
    3. Detects language format.
    4. Extracts clinically reviewed symptom concepts.
    5. Categorizes context (POSITIVE, NEGATED, UNCERTAIN, HISTORICAL).
    6. Identifies red-flag triggers strictly from positive concepts.
    7. Flags ambiguous or unsupported language for nurse review.
    """
    if not text or not text.strip():
        return ProcessedComplaint(
            original_complaint="",
            normalized_text="",
            detected_language=LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED,
            extracted_symptoms=[],
            requires_nurse_review=True,
            review_reason="Empty or missing chief complaint; requires nurse intake.",
        )

    original = text
    normalized = normalize_complaint_text(original)
    language = detect_complaint_language(normalized)

    extracted_symptoms: List[ExtractedSymptomConcept] = []
    seen_concepts: Set[str] = set()

    # Search for known symptom concepts
    for concept, lang_dict in SYMPTOM_DICTIONARY.items():
        matched_term = None
        match_span = None

        # Check relevant terms for detected language and fallback to all languages
        terms_to_check: List[str] = []
        if language == LanguageFormat.TELUGU_SCRIPT:
            terms_to_check = lang_dict.get("te_script", []) + lang_dict.get("en", [])
        elif language == LanguageFormat.TELUGU_TRANSLITERATION:
            terms_to_check = lang_dict.get("te_translit", []) + lang_dict.get("en", [])
        else:
            terms_to_check = lang_dict.get("en", []) + lang_dict.get("te_translit", []) + lang_dict.get("te_script", [])

        # Find best match
        for term in sorted(terms_to_check, key=len, reverse=True):
            span = _find_phrase_in_text(normalized, term)
            if span:
                matched_term = term
                match_span = span
                break

        if matched_term and match_span:
            start_i, end_i = match_span
            context = _detect_context(normalized, start_i, end_i, language)
            is_rf = concept in RED_FLAG_CONCEPTS

            extracted_symptoms.append(
                ExtractedSymptomConcept(
                    concept=concept,
                    matched_term=matched_term,
                    context=context,
                    language_format=language,
                    is_red_flag=is_rf,
                    confidence=0.95 if context == SymptomContext.POSITIVE else 0.85,
                )
            )
            seen_concepts.add(concept)

    # Separate by context
    positive = [s.concept for s in extracted_symptoms if s.context == SymptomContext.POSITIVE]
    negated = [s.concept for s in extracted_symptoms if s.context == SymptomContext.NEGATED]
    uncertain = [s.concept for s in extracted_symptoms if s.context == SymptomContext.UNCERTAIN]
    historical = [s.concept for s in extracted_symptoms if s.context == SymptomContext.HISTORICAL]

    # Red flag triggers ONLY from positive symptoms!
    # (A negated chest pain or historical fever must NEVER trigger an acute red flag)
    red_flag_triggers = [
        s.concept for s in extracted_symptoms
        if s.is_red_flag and s.context == SymptomContext.POSITIVE
    ]

    # Nurse review evaluation:
    # 1. If language is Ambiguous/Unsupported
    # 2. Or very short complaint without recognizable clinical concepts
    # 3. Or contains uncertain clinical findings
    requires_review = False
    review_reason = None

    if language == LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED:
        requires_review = True
        review_reason = "Unsupported language format or unrecognized dialect. Requires nurse translation verification."
    elif len(normalized.split()) < 2 and len(extracted_symptoms) == 0:
        requires_review = True
        review_reason = "Very brief or vague complaint text without extractable symptoms. Nurse clarification recommended."
    elif len(uncertain) > 0:
        requires_review = True
        review_reason = f"Clinical uncertainty detected for symptoms ({', '.join(uncertain)}). Nurse assessment required."

    return ProcessedComplaint(
        original_complaint=original,
        normalized_text=normalized,
        detected_language=language,
        extracted_symptoms=extracted_symptoms,
        positive_concepts=positive,
        negated_concepts=negated,
        uncertain_concepts=uncertain,
        historical_concepts=historical,
        red_flag_triggers=red_flag_triggers,
        requires_nurse_review=requires_review,
        review_reason=review_reason,
    )


def check_red_flags_from_symptoms(extracted_symptoms: List[ExtractedSymptomConcept]) -> List[str]:
    """
    Independently testable safety-critical red flag checker.
    Returns list of triggered red flag concepts strictly from POSITIVE symptoms.
    Negated, uncertain, or historical symptoms are explicitly excluded.
    """
    return [
        s.concept for s in extracted_symptoms
        if s.is_red_flag and s.context == SymptomContext.POSITIVE
    ]
