import { theme } from 'antd'

const shared = {
  token: {
    colorPrimary: '#465A27',
    colorPrimaryHover: '#3F5123',
    colorPrimaryActive: '#35421F',
    colorInfo: '#465A27',
    colorSuccess: '#465A27',
    colorWarning: '#E88A2D',
    colorError: '#B42318',
    colorText: '#35421F',
    colorTextSecondary: '#6B7280',
    colorBorder: '#D9DFC9',
    colorBorderSecondary: '#E5EBD6',
    colorBgLayout: '#FAFBF7',
    colorBgContainer: '#FFFFFF',
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: "'IBM Plex Sans', 'Source Sans 3', system-ui, sans-serif",
    fontSize: 14,
    controlHeight: 36,
    boxShadow: 'none',
    boxShadowSecondary: '0 8px 24px rgba(53, 66, 31, 0.08)',
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      siderBg: '#FFFFFF',
      bodyBg: '#FAFBF7',
      headerHeight: 56,
      headerPadding: '0 20px',
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemHeight: 40,
      itemSelectedBg: '#E5EBD6',
      itemSelectedColor: '#465A27',
      itemHoverBg: '#E5EBD6',
      subMenuItemBg: 'transparent',
    },
    Card: {
      headerFontSize: 14,
      headerHeight: 48,
      paddingLG: 20,
      colorBgContainer: '#FFFFFF',
    },
    Table: {
      headerBg: '#556B2F',
      headerColor: '#FFFFFF',
      headerSplitColor: '#465A27',
      rowHoverBg: '#F4F6EE',
      borderColor: '#D9DFC9',
    },
    Button: {
      fontWeight: 600,
      primaryColor: '#FFFFFF',
      defaultBorderColor: '#D9DFC9',
      defaultColor: '#35421F',
    },
    Statistic: {
      contentFontSize: 32,
      titleFontSize: 13,
    },
    Select: {
      // Keep gray focus — no green halo on Pulse selects (workspace rule).
      hoverBorderColor: '#D9D9D9',
      activeBorderColor: '#D9D9D9',
      activeOutlineColor: 'transparent',
      optionActiveBg: '#E5EBD6',
      optionSelectedBg: '#E5EBD6',
      optionSelectedColor: '#35421F',
      optionSelectedFontWeight: 400,
      controlItemBgActiveHover: '#E5EBD6',
    },
    DatePicker: {
      hoverBorderColor: '#D9D9D9',
      activeBorderColor: '#D9D9D9',
      activeShadow: 'none',
      activeOutlineColor: 'transparent',
    },
    Tabs: {
      itemSelectedColor: '#35421F',
      itemActiveColor: '#35421F',
      inkBarColor: '#E88A2D',
    },
  },
}

export const lightTheme = {
  ...shared,
  algorithm: theme.defaultAlgorithm,
}

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...shared.token,
    colorText: '#F5F2EC',
    colorTextSecondary: '#A8A29E',
    colorBorder: '#3F3B36',
    colorBorderSecondary: '#2C2926',
    colorBgContainer: '#1C1917',
    colorBgLayout: '#141210',
  },
  components: {
    ...shared.components,
    Layout: {
      headerBg: '#1C1917',
      siderBg: '#1C1917',
      bodyBg: '#141210',
      headerHeight: 56,
      headerPadding: '0 20px',
    },
    Menu: {
      ...shared.components.Menu,
      itemSelectedBg: '#243830',
      itemSelectedColor: '#9FE1C3',
      itemHoverBg: '#2A2623',
    },
    Tabs: {
      itemColor: '#A8A29E',
      itemHoverColor: '#E7E5E4',
      itemSelectedColor: '#9FE1C3',
      itemActiveColor: '#9FE1C3',
      inkBarColor: '#E88A2D',
    },
    Table: {
      headerBg: '#241F1C',
      headerColor: '#A8A29E',
      rowHoverBg: '#241F1C',
    },
    Select: {
      hoverBorderColor: '#3F3B36',
      activeBorderColor: '#3F3B36',
      activeOutlineColor: 'transparent',
      optionActiveBg: '#332F2B',
      optionSelectedBg: '#3A352F',
      optionSelectedColor: '#F5F2EC',
      optionSelectedFontWeight: 400,
      controlItemBgActiveHover: '#332F2B',
    },
    DatePicker: {
      hoverBorderColor: '#3F3B36',
      activeBorderColor: '#3F3B36',
      activeShadow: 'none',
      activeOutlineColor: 'transparent',
    },
  },
}
