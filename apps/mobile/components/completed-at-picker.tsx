import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { tFallback } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';

type CompletedAtPickerProps = {
    /** ISO timestamp the picker starts from; defaults to now. */
    initialValue?: string;
    onCancel: () => void;
    onConfirm: (iso: string) => void;
    t: (key: string) => string;
    tc: ThemeColors;
};

const toValidDate = (value?: string): Date => {
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Date + time picker for a task's completion timestamp. iOS shows a single
 * datetime spinner in a modal; Android chains the native date and time dialogs.
 */
export function CompletedAtPicker({ initialValue, onCancel, onConfirm, t, tc }: CompletedAtPickerProps) {
    const [draft, setDraft] = useState<Date>(() => toValidDate(initialValue));
    const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date');

    if (Platform.OS === 'android') {
        return (
            <DateTimePicker
                key={androidStep}
                value={draft}
                mode={androidStep}
                display="default"
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    if (event.type === 'dismissed' || !selected) {
                        onCancel();
                        return;
                    }
                    if (androidStep === 'date') {
                        const next = new Date(draft);
                        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                        setDraft(next);
                        setAndroidStep('time');
                        return;
                    }
                    const next = new Date(draft);
                    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                    onConfirm(next.toISOString());
                }}
            />
        );
    }

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
            <Pressable style={styles.overlay} onPress={onCancel}>
                <Pressable
                    style={[styles.card, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                    onPress={(event) => event.stopPropagation()}
                >
                    <Text style={[styles.title, { color: tc.text }]} accessibilityRole="header">
                        {tFallback(t, 'task.completedAtPromptTitle', 'Completion time')}
                    </Text>
                    <DateTimePicker
                        value={draft}
                        mode="datetime"
                        display="spinner"
                        textColor={tc.text}
                        onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                            if (selected) setDraft(selected);
                        }}
                    />
                    <View style={styles.actions}>
                        <Pressable onPress={onCancel} accessibilityRole="button" style={styles.actionButton}>
                            <Text style={[styles.actionText, { color: tc.secondaryText }]}>
                                {t('common.cancel') || 'Cancel'}
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => onConfirm(draft.toISOString())}
                            accessibilityRole="button"
                            style={styles.actionButton}
                        >
                            <Text style={[styles.actionText, { color: tc.tint }]}>
                                {t('common.save') || 'Save'}
                            </Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 16,
        marginTop: 8,
    },
    actionButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
