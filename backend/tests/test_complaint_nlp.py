"""
Unit tests for the modular chief-complaint text-processing component.
Tests multilingual recognition (English, Telugu Script, Telugu Transliteration),
contextual negation preservation, uncertainty detection, historical symptoms,
and independent safety-critical red flag checks.
"""

import pytest
from app.nlp.complaint_processor import (
    process_complaint,
    check_red_flags_from_symptoms,
    LanguageFormat,
    SymptomContext,
)
from app.nlp.symptom_dictionary import (
    CONCEPT_CHEST_PAIN,
    CONCEPT_RESPIRATORY_DISTRESS,
    CONCEPT_FEVER,
    CONCEPT_SEIZURE,
    CONCEPT_HEADACHE,
)


def test_preserves_original_complaint_verbatim():
    """Verifies that the original complaint is never silently altered or discarded."""
    raw = "   Patient presents with: High fever and mild cough...   "
    res = process_complaint(raw)
    assert res.original_complaint == raw
    assert res.normalized_text == "Patient presents with: High fever and mild cough..."


def test_language_detection_separate_from_translation():
    """Tests language detection across English, Telugu script, transliteration, and unsupported."""
    # English
    en_res = process_complaint("Severe chest tightness radiating to left shoulder")
    assert en_res.detected_language == LanguageFormat.ENGLISH

    # Telugu script
    te_script_res = process_complaint("గుండె నొప్పి మరియు శ్వాస ఆడకపోవడం ఉంది")
    assert te_script_res.detected_language == LanguageFormat.TELUGU_SCRIPT

    # Telugu Latin transliteration
    te_translit_res = process_complaint("gunde lo noppi vachindi, aayasam ga undi")
    assert te_translit_res.detected_language == LanguageFormat.TELUGU_TRANSLITERATION

    # Ambiguous or unsupported symbols
    unsupported_res = process_complaint("### ??? !!!")
    assert unsupported_res.detected_language == LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED
    assert unsupported_res.requires_nurse_review is True


def test_distinguishes_positive_and_negated_symptoms_english():
    """Verifies that 'no chest pain' is recognized as NEGATED, while 'fever' is POSITIVE."""
    complaint = "Patient has high fever for 3 days but denies chest pain"
    res = process_complaint(complaint)

    assert CONCEPT_FEVER in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.negated_concepts
    assert CONCEPT_CHEST_PAIN not in res.positive_concepts


def test_distinguishes_negation_in_telugu_transliteration():
    """Verifies that post-negation 'gunde noppi ledu' is marked as NEGATED, not POSITIVE."""
    complaint = "jwaram vachindi, gunde noppi ledu"
    res = process_complaint(complaint)

    assert CONCEPT_FEVER in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.negated_concepts
    assert CONCEPT_CHEST_PAIN not in res.positive_concepts


def test_distinguishes_negation_in_telugu_script():
    """Verifies negation with Telugu script 'లేదు'."""
    complaint = "తీవ్రమైన జ్వరం ఉంది కానీ గుండె నొప్పి లేదు"
    res = process_complaint(complaint)

    assert CONCEPT_FEVER in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.negated_concepts
    assert CONCEPT_CHEST_PAIN not in res.positive_concepts


def test_distinguishes_uncertainty_and_historical_symptoms():
    """Verifies clinical uncertainty ('maybe') and historical symptom tags."""
    uncertain_complaint = "Maybe had a seizure yesterday, now conscious"
    res_unc = process_complaint(uncertain_complaint)
    assert CONCEPT_SEIZURE in res_unc.uncertain_concepts
    assert res_unc.requires_nurse_review is True

    hist_complaint = "Had fever last week, currently resolved, routine medication refill"
    res_hist = process_complaint(hist_complaint)
    assert CONCEPT_FEVER in res_hist.historical_concepts
    assert CONCEPT_FEVER not in res_hist.positive_concepts


def test_red_flag_triggered_only_by_positive_symptoms():
    """
    CRITICAL SAFETY REQUIREMENT:
    Red flags must ONLY trigger from verified POSITIVE symptoms.
    Negated chest pain must NEVER trigger a red-flag alert.
    """
    # 1. Negative chest pain -> NO red flag
    neg_res = process_complaint("Has mild headache, no chest pain")
    red_flags_neg = check_red_flags_from_symptoms(neg_res.extracted_symptoms)
    assert CONCEPT_CHEST_PAIN not in red_flags_neg
    assert CONCEPT_HEADACHE in neg_res.positive_concepts

    # 2. Positive chest pain -> RED FLAG triggered
    pos_res = process_complaint("Severe crushing chest pain and breathlessness")
    red_flags_pos = check_red_flags_from_symptoms(pos_res.extracted_symptoms)
    assert CONCEPT_CHEST_PAIN in red_flags_pos
    assert CONCEPT_RESPIRATORY_DISTRESS in red_flags_pos


def test_telugu_transliteration_red_flag_extraction():
    """Verifies that Telugu transliteration triggers appropriate red flag concept."""
    res = process_complaint("gundelo noppi undi and aayasam ekkuva")
    assert CONCEPT_CHEST_PAIN in res.positive_concepts
    assert CONCEPT_RESPIRATORY_DISTRESS in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.red_flag_triggers


def test_does_not_treat_keyword_as_diagnosis():
    """Checks that the clinical disclaimer is always present explaining it is not a diagnosis."""
    res = process_complaint("Patient complains of chest pain")
    assert "NOT constitute a diagnosis" in res.clinical_disclaimer
