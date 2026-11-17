APP_QSS = """
QWidget {
    background: #EEF3F8;
    color: #142033;
    font-size: 14px;
}

QLabel,
QCheckBox {
    background: transparent;
}
QMainWindow::separator {
    width: 1px;
    height: 1px;
    background: #E2E8F0;
}
QFrame#TopBar,
QFrame#AccountListPanel,
QFrame#RightPanel,
QFrame#PreviewHeader,
QDialog#LogDialog,
QFrame#LoginCard,
QFrame#TenantCard,
QFrame#PreviewCanvas {
    background: #FFFFFF;
    border: 1px solid #E5ECF5;
    border-radius: 20px;
}
QLabel#TopBarLogo {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0F172A, stop:0.65 #1D4ED8, stop:1 #7C3AED);
    color: white;
    border-radius: 22px;
    min-width: 46px;
    max-width: 46px;
    min-height: 46px;
    max-height: 46px;
    font-weight: 800;
    font-size: 16px;
    qproperty-alignment: AlignCenter;
}
QPushButton#TopPlatformButton,
QPushButton#InlineFilterButton {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    color: #475569;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 700;
}
QPushButton#TopPlatformButton:checked,
QPushButton#InlineFilterButton:checked {
    background: #16213A;
    color: #FFFFFF;
    border: 1px solid #16213A;
}
QPushButton#TopPlatformButton:hover,
QPushButton#InlineFilterButton:hover {
    border: 1px solid #93A6BE;
}
QPushButton#NeutralActionButton,
QPushButton#PrimaryActionButton,
QPushButton#AccentActionButton,
QPushButton#GhostActionButton,
QPushButton#DangerActionButton,
QPushButton#LoginPrimaryButton,
QPushButton#CardStartButton,
QPushButton#CardStopButton,
QPushButton#CardLogButton {
    color: #FFFFFF;
    border-radius: 12px;
    padding: 10px 16px;
    text-align: center;
    font-size: 14px;
    font-weight: 800;
    border: none;
}
QPushButton#NeutralActionButton { background: #334155; }
QPushButton#NeutralActionButton:hover { background: #1E293B; }
QPushButton#PrimaryActionButton,
QPushButton#CardStartButton { background: #0F766E; }
QPushButton#CardLogButton { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #2563EB, stop:1 #4F46E5); }
QPushButton#PrimaryActionButton:hover,
QPushButton#CardStartButton:hover { background: #115E59; }
QPushButton#CardLogButton:hover { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1D4ED8, stop:1 #4338CA); }
QPushButton#CardIconLogButton {
    background: #EEF4FF;
    color: #1D4ED8;
    border: 1px solid #C7D7FE;
    border-radius: 10px;
    padding: 4px 6px;
    min-width: 34px;
    max-width: 38px;
    min-height: 26px;
    max-height: 28px;
    font-size: 14px;
    font-weight: 900;
}
QPushButton#CardIconLogButton:hover {
    background: #DBEAFE;
    border: 1px solid #93C5FD;
}
QPushButton#AccentActionButton { background: #1D4ED8; }
QPushButton#AccentActionButton:hover { background: #1E40AF; }
QPushButton#GhostActionButton { background: #6366F1; }
QPushButton#GhostActionButton:hover { background: #4F46E5; }
QPushButton#DangerActionButton,
QPushButton#CardStopButton { background: #E11D48; }
QPushButton#DangerActionButton:hover,
QPushButton#CardStopButton:hover { background: #BE123C; }
QPushButton#LoginPrimaryButton { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #2563EB, stop:1 #4338CA); }
QPushButton#LoginPrimaryButton:hover { background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1D4ED8, stop:1 #3730A3); }
QPushButton#NeutralActionButton:disabled,
QPushButton#PrimaryActionButton:disabled,
QPushButton#AccentActionButton:disabled,
QPushButton#GhostActionButton:disabled,
QPushButton#DangerActionButton:disabled,
QPushButton#LoginPrimaryButton:disabled,
QPushButton#CardStartButton:disabled,
QPushButton#CardStopButton:disabled,
QPushButton#CardLogButton:disabled,
QPushButton:disabled {
    background: #D1D5DB;
    color: #F9FAFB;
}
QLabel#TopPageTitle,
QLabel#SectionTitle {
    font-size: 17px;
    font-weight: 800;
}
QLabel#TopStatusHint,
QLabel#AccountMeta,
QLabel#LoginSubtitle,
QLabel#InfoTitleLabel,
QLabel#PreviewSubTitle {
    color: #64748B;
    font-size: 12px;
    font-weight: 600;
}
QLabel#PreviewPlaceholder {
    color: #64748B;
    font-size: 15px;
    padding: 28px;
    line-height: 1.7;
}
QLabel#AccountName,
QLabel#InfoValueLabel {
    font-size: 14px;
    font-weight: 800;
}
QFrame#AccountCard {
    background: #FBFDFF;
    border: 1px solid #DDE8F5;
    border-radius: 20px;
}
QFrame#AccountCard:hover {
    border: 1px solid #9CB0C8;
    background: #FFFFFF;
}

QLabel#RobotTypeLabel {
    color: #64748B;
    font-size: 12px;
    font-weight: 800;
}
QFrame#AccountMetaPanel {
    background: #F8FBFF;
    border: 1px solid #E5EDF7;
    border-radius: 14px;
}
QFrame#AccountActionPanel {
    background: #F8FAFC;
    border: 1px solid #E2EAF4;
    border-radius: 16px;
}
QPushButton {
    background: #111827;
    color: white;
    border-radius: 10px;
    padding: 8px 12px;
    border: none;
}
QPushButton:hover { background: #1F2937; }
QPushButton#GhostButton {
    background: #F8FAFC;
    color: #0F172A;
    border: 1px solid #E2E8F0;
}
QPushButton#GhostButton:hover { background: #F1F5F9; }
QPushButton#CardLogoutLink {
    background: transparent;
    color: #64748B;
    border: none;
    padding: 4px 2px;
    font-size: 12px;
    font-weight: 700;
}
QPushButton#CardLogoutLink:hover {
    color: #DC2626;
    background: transparent;
}
QPushButton#CardLogButton {
    min-height: 38px;
}
QPushButton#CardStartButton,
QPushButton#CardStopButton {
    min-height: 38px;
}
QTextEdit {
    background: #0F172A;
    color: #E2E8F0;
    border-radius: 12px;
    border: 1px solid #0F172A;
    font-family: Consolas, Menlo, monospace;
    font-size: 12px;
    padding: 8px;
}
QListWidget#RobotListWidget {
    background: transparent;
    border: none;
    outline: none;
}
QListWidget#RobotListWidget::item {
    margin-bottom: 10px;
    border-radius: 16px;
}
QListWidget#RobotListWidget::item:selected {
    background: #E8F0FF;
}
QTabWidget::pane {
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    background: #FFFFFF;
}
QTabBar::tab {
    background: #F8FAFC;
    color: #475569;
    padding: 8px 14px;
    margin-right: 4px;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    border: 1px solid #E2E8F0;
}
QTabBar::tab:selected {
    background: #16213A;
    color: white;
}
QLineEdit#LoginInput {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 14px;
}
QLabel#LoginFieldLabel {
    color: #64748B;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
}
QLabel#LoginTitle {
    font-size: 28px;
    font-weight: 800;
    color: #0F172A;
}
QLabel#LoginLogo {
    min-width: 72px;
    max-width: 72px;
    min-height: 72px;
    max-height: 72px;
    border-radius: 24px;
    color: white;
    font-size: 24px;
    font-weight: 800;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0F172A, stop:0.6 #1D4ED8, stop:1 #7C3AED);
}
QTableWidget {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    gridline-color: #E2E8F0;
}
QHeaderView::section {
    background: #F8FAFC;
    color: #475569;
    padding: 8px;
    border: none;
    border-bottom: 1px solid #E2E8F0;
    font-weight: 700;
}
"""

# appended refinements
APP_QSS += """
QCheckBox#LoginRememberCheck {
    color: #475569;
    font-size: 13px;
    font-weight: 600;
    spacing: 8px;
}
QFrame#LoginCard,
QFrame#TenantCard {
    border-radius: 26px;
    border: 1px solid #E5ECF5;
}
QFrame#RightPanel {
    padding: 0px;
}
QFrame#PreviewCanvas {
    background: #F5F8FC;
    border: 1px solid #E6EDF5;
    border-radius: 18px;
}
QPushButton#CardStartButton,
QPushButton#CardStopButton {
    min-height: 28px;
    padding: 6px 10px;
    font-size: 13px;
}
QLabel#boundAccountLabel,
QLabel#expireLabel {
    color: #475569;
    font-size: 12px;
    font-weight: 600;
}
QListWidget#TenantListWidget {
    background: #F7FAFD;
    border: 1px solid #E2E8F0;
    border-radius: 18px;
    outline: none;
    selection-background-color: transparent;
    padding: 8px;
    min-height: 250px;
    min-width: 430px;
}
QListWidget#TenantListWidget::item {
    margin: 6px;
    padding: 0px;
    border-radius: 16px;
    min-height: 88px;
}
QListWidget#TenantListWidget::item:selected {
    background: transparent;
    border: none;
}
QListWidget#TenantListWidget::item:focus {
    outline: none;
    border: none;
}
QFrame#TenantOptionCard {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 16px;
    min-height: 82px;
}
QFrame#TenantOptionCard[selected="true"] {
    background: #F8FFFC;
    border: 1px solid #99F6E4;
}
QLabel#TenantSelectedBadge {
    color: #0F766E;
    background: #CCFBF1;
    border-radius: 10px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 800;
}
QLabel#TenantName {
    font-size: 15px;
    font-weight: 800;
    color: #0F172A;
    padding: 0px;
}
QLabel#TenantCode {
    font-size: 12px;
    color: #64748B;
    font-weight: 600;
    padding: 0px;
}
QLabel#TenantBadge {
    color: #0F766E;
    background: #DDF6EF;
    border-radius: 10px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 800;
}
QLabel#TenantLogo {
    min-width: 64px;
    max-width: 64px;
    min-height: 64px;
    max-height: 64px;
    border-radius: 22px;
    color: white;
    font-size: 16px;
    font-weight: 800;
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0F766E, stop:1 #2563EB);
}

/* 2026-05-02: compact unified robot card, aligned with Douyin card style */
QListWidget#RobotListWidget {
    background: transparent;
    border: none;
    outline: none;
}
QListWidget#RobotListWidget::item {
    margin: 0px;
    padding: 0px;
    border: none;
}
QListWidget#RobotListWidget::item:selected {
    background: transparent;
}
QFrame#AccountCard {
    background: #FBFDFF;
    border: 1px solid #DDE8F5;
    border-radius: 18px;
}
QFrame#AccountCard:hover {
    background: #FFFFFF;
    border: 1px solid #AFC1D8;
}
QFrame#AccountMetaPanel {
    background: #F8FBFF;
    border: 1px solid #E6EEF8;
    border-radius: 12px;
}
QLabel#AccountName {
    color: #0F172A;
    font-size: 13px;
    font-weight: 900;
}
QLabel#RobotTypeLabel {
    color: #64748B;
    font-size: 12px;
    font-weight: 800;
}
QLabel#boundAccountLabel,
QLabel#expireLabel {
    color: #334155;
    font-size: 12px;
    font-weight: 700;
}
QPushButton#CardIconLogButton {
    background: #EEF4FF;
    color: #1D4ED8;
    border: 1px solid #C7D7FE;
    border-radius: 10px;
    padding: 3px 7px;
    min-width: 38px;
    max-width: 42px;
    min-height: 26px;
    max-height: 28px;
    font-size: 12px;
    font-weight: 900;
}
QPushButton#CardIconLogButton:hover {
    background: #DBEAFE;
    border: 1px solid #93C5FD;
}
QPushButton#CardStartButton,
QPushButton#CardStopButton {
    color: #FFFFFF;
    border-radius: 12px;
    padding: 8px 12px;
    min-height: 30px;
    max-height: 36px;
    font-size: 13px;
    font-weight: 900;
    border: none;
}
QPushButton#CardStartButton {
    background: #0F766E;
}
QPushButton#CardStartButton:hover {
    background: #115E59;
}
QPushButton#CardStopButton {
    background: #E11D48;
}
QPushButton#CardStopButton:hover {
    background: #BE123C;
}
QPushButton#CardStartButton:disabled,
QPushButton#CardStopButton:disabled {
    background: #CBD5E1;
    color: #FFFFFF;
}

"""