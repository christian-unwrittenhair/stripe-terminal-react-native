import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  ScrollView,
  Alert,
  Modal,
  View,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import {
  useStripeTerminal,
  Location,
  Reader,
} from 'stripe-terminal-react-native';
import type { NavigationAction } from '@react-navigation/routers';
import { colors } from '../colors';
import { useNavigation, useRoute } from '@react-navigation/core';
import { Picker } from '@react-native-picker/picker';
import ListItem from '../components/ListItem';
import List from '../components/List';

const SIMULATED_UPDATE_PLANS = [
  'random',
  'available',
  'none',
  'required',
  'lowBattery',
];

export default function DiscoverReadersScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const [discoveringLoading, setDiscoveringLoading] = useState(true);
  const [connectingReaderId, setConnectingReaderId] = useState<string>();
  const [showPicker, setShowPicker] = useState(false);

  const { simulated, discoveryMethod } = params as Record<string, any>;

  const {
    cancelDiscovering,
    discoverReaders,
    connectBluetoothReader,
    discoveredReaders,
    connectInternetReader,
    simulateReaderUpdate,
  } = useStripeTerminal({
    onFinishDiscoveringReaders: (finishError) => {
      if (finishError) {
        Alert.alert(
          'Discover readers error',
          `${finishError.code}, ${finishError.message}`
        );
      } else {
        console.log('onFinishDiscoveringReaders success');
      }
      setDiscoveringLoading(false);
    },
    onDidStartInstallingUpdate: (update) => {
      const reader = discoveredReaders.find(
        (r) => r.serialNumber === connectingReaderId
      );

      navigation.navigate('UpdateReaderScreen', {
        update,
        reader,
        onDidUpdate: () => {
          setTimeout(() => {
            navigation.goBack();
          }, 500);
        },
      });
    },
  });

  const [selectedLocation, setSelectedLocation] = useState<Location>();
  const [selectedUpdatePlan, setSelectedUpdatePlan] =
    useState<Reader.SimulateUpdateType>('none');

  const handleGoBack = useCallback(
    async (action: NavigationAction) => {
      await cancelDiscovering();
      if (navigation.canGoBack()) {
        navigation.dispatch(action);
      }
    },
    [cancelDiscovering, navigation]
  );

  useEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'Cancel',
    });

    navigation.addListener('beforeRemove', (e) => {
      if (!discoveringLoading) {
        return;
      }
      e.preventDefault();
      handleGoBack(e.data.action);
    });
  }, [navigation, cancelDiscovering, discoveringLoading, handleGoBack]);

  const handleDiscoverReaders = async () => {
    setDiscoveringLoading(true);
    // List of discovered readers will be available within useStripeTerminal hook
    const { error: discoverReadersError } = await discoverReaders({
      discoveryMethod,
      simulated,
    });

    if (discoverReadersError) {
      const { code, message } = discoverReadersError;
      Alert.alert('Discover readers error: ', `${code}, ${message}`);
    }
  };

  useEffect(() => {
    simulateReaderUpdate('none');
    handleDiscoverReaders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectReader = async (id: string) => {
    if (discoveryMethod === 'internet') {
      const { error } = await handleConnectInternetReader(id);
      if (error) {
        Alert.alert(error.code, error.message);
      } else if (selectedUpdatePlan !== 'required') {
        navigation.goBack();
      }
    } else if (
      discoveryMethod === 'bluetoothScan' ||
      discoveryMethod === 'bluetoothProximity'
    ) {
      const { error } = await handleConnectBluetoothReader(id);
      if (error) {
        Alert.alert(error.code, error.message);
      } else if (selectedUpdatePlan !== 'required') {
        navigation.goBack();
      }
    }
  };

  const handleConnectBluetoothReader = async (id: string) => {
    setConnectingReaderId(id);

    const { reader, error } = await connectBluetoothReader({
      readerId: id,
      locationId: selectedLocation?.id,
    });

    if (error) {
      console.log('connectBluetoothReader error:', error);
    } else {
      console.log('Reader connected successfully', reader);
    }
    return { error };
  };

  const handleConnectInternetReader = async (id: string) => {
    setConnectingReaderId(id);

    const { reader, error } = await connectInternetReader({
      readerId: id,
      failIfInUse: true,
    });

    if (error) {
      console.log('connectInternetReader error:', error);
    } else {
      console.log('Reader connected successfully', reader);
    }
    return { error };
  };

  const handleChangeUpdatePlan = async (plan: Reader.SimulateUpdateType) => {
    await simulateReaderUpdate(plan);
    setSelectedUpdatePlan(plan);
  };

  return (
    <ScrollView
      testID="discovery-readers-screen"
      contentContainerStyle={styles.container}
    >
      <List title="SELECT LOCATION">
        <ListItem
          onPress={() => {
            if (!simulated) {
              navigation.navigate('LocationListScreen', {
                onSelect: (location: Location) => setSelectedLocation(location),
              });
            }
          }}
          disabled={simulated}
          title={
            simulated
              ? 'Mock simulated reader location'
              : selectedLocation?.displayName || 'No location selected'
          }
        />

        {simulated ? (
          <Text style={styles.infoText}>
            Simulated readers are always registered to the mock simulated
            location.
          </Text>
        ) : (
          <Text style={styles.infoText}>
            Bluetooth readers must be registered to a location during the
            connection process. If you do not select a location, the reader will
            attempt to register to the same location it was registered to during
            the previous connection.
          </Text>
        )}
      </List>

      {simulated && (
        <List title="SIMULATED UPDATE PLAN">
          <ListItem
            testID="update-plan-picker"
            onPress={() => setShowPicker(true)}
            title={mapToPlanDisplayName(selectedUpdatePlan)}
          />
        </List>
      )}

      <List
        title="NEARBY READERS"
        loading={discoveringLoading}
        description={connectingReaderId ? 'Connecting...' : undefined}
      >
        {discoveredReaders.map((reader) => (
          <ListItem
            key={reader.serialNumber}
            onPress={() => handleConnectReader(reader.serialNumber)}
            title={`${reader.id || 'SimulatorID'} - ${reader.deviceType}`}
          />
        ))}
      </List>

      <Modal visible={showPicker} transparent>
        <TouchableWithoutFeedback
          testID="close-picker"
          onPress={() => setShowPicker(false)}
        >
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>

        <View style={styles.pickerContainer} testID="picker-container">
          <Picker
            selectedValue={selectedUpdatePlan}
            style={styles.picker}
            itemStyle={styles.pickerItem}
            onValueChange={(itemValue) => handleChangeUpdatePlan(itemValue)}
          >
            {SIMULATED_UPDATE_PLANS.map((plan) => (
              <Picker.Item
                key={plan}
                label={mapToPlanDisplayName(plan)}
                testID={plan}
                value={plan}
              />
            ))}
          </Picker>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.light_gray,
    flex: 1,
  },
  pickerContainer: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: colors.white,
    left: 0,
    width: '100%',
    ...Platform.select({
      ios: {
        height: 200,
      },
    }),
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  discoveredWrapper: {
    height: 50,
  },
  buttonWrapper: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
    width: '100%',
  },
  locationListTitle: {
    fontWeight: '700',
  },
  picker: {
    width: '100%',
  },
  pickerItem: {
    fontSize: 16,
  },
  text: {
    paddingHorizontal: 12,
    color: colors.white,
  },
  info: {
    fontWeight: '700',
    marginVertical: 10,
  },
  serialNumber: {
    maxWidth: '70%',
  },
  cancelButton: {
    color: colors.white,
    marginLeft: 22,
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  infoText: {
    paddingHorizontal: 16,
    color: colors.dark_gray,
    marginVertical: 16,
  },
});

function mapToPlanDisplayName(plan: string) {
  switch (plan) {
    case 'random':
      return 'Random';
    case 'available':
      return 'Update Available';
    case 'none':
      return 'No Update';
    case 'required':
      return 'Update required';
    case 'lowBattery':
      return 'Update required; reader has low battery';
    default:
      return '';
  }
}